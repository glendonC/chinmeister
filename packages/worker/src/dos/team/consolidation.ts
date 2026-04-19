// Background consolidation pass — identifies near-duplicate memories using
// the Graphiti funnel pattern (cosine recall → Jaccard structural → tag
// agreement) and writes propose-only candidates to the review queue. The
// agent or operator applies a proposal explicitly via apply_consolidation;
// nothing merges automatically.
//
// Hard rules:
//   - never merges memories whose tag sets carry contradictory signals
//     (decision:rejected vs decision:accepted) regardless of cosine
//   - never auto-applies; the proposal sits in the queue until reviewed
//   - merge writes are reversible via unmerge_memory()

import type { DOResult } from '../../types.js';
import { createLogger } from '../../lib/logger.js';
import { safeParse } from '../../lib/safe-parse.js';

const log = createLogger('TeamDO.consolidation');

// Graphiti uses 0.6 as a recall gate; we lift to 0.85 because chinwag has
// a smaller corpus where the cost of wrong merges is concentrated. Real
// near-dup territory for bge-small-en-v1.5 is 0.92+, but the structural
// gate (Jaccard) and tag-agreement gate are the actual decision points.
const COSINE_RECALL = 0.85;
// Jaccard on character trigrams. ≥0.6 catches paraphrased duplicates while
// rejecting "same gotcha for different file" pairs that happen to share
// embedding space because the prose pattern is similar.
const JACCARD_FLOOR = 0.6;
// Tag-set decision-marker conflicts that block merge regardless of other
// signals. If both memories carry one of these and they disagree (or one
// has accepted/the other has rejected), they stay separate.
const CONTRADICTORY_MARKERS: Array<[string, string]> = [
  ['accepted', 'rejected'],
  ['approved', 'declined'],
  ['kept', 'reverted'],
];

/** Cosine similarity between two equal-length Float32Arrays. */
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    na += av * av;
    nb += bv * bv;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Character-trigram set for Jaccard. Lowercased, whitespace-collapsed. */
function trigrams(text: string): Set<string> {
  const norm = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (norm.length < 3) return new Set([norm]);
  const out = new Set<string>();
  for (let i = 0; i <= norm.length - 3; i++) {
    out.add(norm.slice(i, i + 3));
  }
  return out;
}

export function jaccardTrigrams(a: string, b: string): number {
  const sa = trigrams(a);
  const sb = trigrams(b);
  if (sa.size === 0 && sb.size === 0) return 1;
  let intersect = 0;
  for (const t of sa) if (sb.has(t)) intersect++;
  const union = sa.size + sb.size - intersect;
  return union === 0 ? 0 : intersect / union;
}

export function tagsAgree(tagsA: string[], tagsB: string[]): boolean {
  const setA = new Set(tagsA.map((t) => t.toLowerCase()));
  const setB = new Set(tagsB.map((t) => t.toLowerCase()));
  for (const [x, y] of CONTRADICTORY_MARKERS) {
    if ((setA.has(x) && setB.has(y)) || (setA.has(y) && setB.has(x))) {
      return false;
    }
  }
  return true;
}

interface ConsolidationStats {
  memoriesScanned: number;
  pairsConsidered: number;
  proposalsCreated: number;
  proposalsAlreadyExisted: number;
  proposalsBlockedByJaccard: number;
  proposalsBlockedByTags: number;
}

/**
 * Pairwise scan over the un-merged memory corpus for the team. For every
 * pair above the cosine recall threshold, run Jaccard + tag-agreement
 * gates and record passing pairs as pending proposals.
 *
 * O(n^2) over the full corpus. At MEMORY_MAX_COUNT=2000 with embedding
 * size 384, this is ~2M comparisons of 1.5KB BLOBs — runs in seconds on
 * a DO. If the corpus grows beyond ~5K rows, pre-bucket by cosine LSH or
 * limit the scan to the most-recent N writes since the last consolidation.
 */
export function consolidateMemories(sql: SqlStorage): DOResult<{ ok: true } & ConsolidationStats> {
  const stats: ConsolidationStats = {
    memoriesScanned: 0,
    pairsConsidered: 0,
    proposalsCreated: 0,
    proposalsAlreadyExisted: 0,
    proposalsBlockedByJaccard: 0,
    proposalsBlockedByTags: 0,
  };

  // Pull all live (un-merged) memories with embeddings. Sort by access
  // count desc so the canonical (winner) tends to be the well-used one
  // when we record proposals.
  const rows = sql
    .exec(
      `SELECT id, text, tags, embedding, access_count, created_at
       FROM memories
       WHERE merged_into IS NULL AND embedding IS NOT NULL
       ORDER BY access_count DESC, created_at DESC`,
    )
    .toArray() as Record<string, unknown>[];

  stats.memoriesScanned = rows.length;
  if (rows.length < 2) return { ok: true, ...stats };

  // Pre-deserialize embeddings once
  type Mem = { id: string; text: string; tags: string[]; embedding: Float32Array };
  const memos: Mem[] = [];
  for (const r of rows) {
    const buf = r.embedding as ArrayBuffer | null;
    if (!buf) continue;
    const parsedTags = safeParse(
      (r.tags as string) || '[]',
      `consolidate memory=${r.id} tags`,
      [],
      log,
    ) as string[];
    memos.push({
      id: r.id as string,
      text: r.text as string,
      tags: parsedTags,
      embedding: new Float32Array(buf),
    });
  }

  // Existing proposals so we don't re-create
  const existing = sql
    .exec("SELECT source_id, target_id FROM consolidation_proposals WHERE status = 'pending'")
    .toArray() as Record<string, unknown>[];
  const existingPairs = new Set(
    existing.map((p) => `${p.source_id as string}::${p.target_id as string}`),
  );

  for (let i = 0; i < memos.length; i++) {
    for (let j = i + 1; j < memos.length; j++) {
      const a = memos[i]!;
      const b = memos[j]!;
      // Vector lengths must match (different embedding versions would mix)
      if (a.embedding.length !== b.embedding.length) continue;
      const cosine = cosineSimilarity(a.embedding, b.embedding);
      if (cosine < COSINE_RECALL) continue;

      stats.pairsConsidered++;

      const jaccard = jaccardTrigrams(a.text, b.text);
      if (jaccard < JACCARD_FLOOR) {
        stats.proposalsBlockedByJaccard++;
        continue;
      }

      if (!tagsAgree(a.tags, b.tags)) {
        stats.proposalsBlockedByTags++;
        continue;
      }

      // Source = the one we'd merge; target = canonical winner. Sorted by
      // access_count desc, so a (lower index) is canonical.
      const targetId = a.id;
      const sourceId = b.id;
      const pairKey = `${sourceId}::${targetId}`;
      if (existingPairs.has(pairKey)) {
        stats.proposalsAlreadyExisted++;
        continue;
      }

      try {
        sql.exec(
          `INSERT INTO consolidation_proposals (id, source_id, target_id, cosine, jaccard)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(source_id, target_id) DO NOTHING`,
          crypto.randomUUID(),
          sourceId,
          targetId,
          cosine,
          jaccard,
        );
        stats.proposalsCreated++;
      } catch (e) {
        log.warn('failed to record consolidation proposal', {
          source: sourceId,
          target: targetId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  return { ok: true, ...stats };
}

/**
 * List pending consolidation proposals for review. Newest first — agents
 * triaging the queue see most recent proposals at the top.
 */
export interface ProposalRow {
  id: string;
  source_id: string;
  target_id: string;
  source_text: string;
  target_text: string;
  cosine: number;
  jaccard: number;
  proposed_at: string;
}

export function listConsolidationProposals(
  sql: SqlStorage,
  limit: number = 50,
): DOResult<{ ok: true; proposals: ProposalRow[] }> {
  const rows = sql
    .exec(
      `SELECT p.id, p.source_id, p.target_id, p.cosine, p.jaccard, p.proposed_at,
              s.text as source_text, t.text as target_text
       FROM consolidation_proposals p
       JOIN memories s ON s.id = p.source_id
       JOIN memories t ON t.id = p.target_id
       WHERE p.status = 'pending'
         AND s.merged_into IS NULL
         AND t.merged_into IS NULL
       ORDER BY p.proposed_at DESC
       LIMIT ?`,
      Math.min(Math.max(1, limit), 200),
    )
    .toArray() as unknown as ProposalRow[];
  return { ok: true, proposals: rows };
}

/**
 * Apply a pending proposal: set source.merged_into = target, mark the
 * proposal applied. Reversible via unmergeMemory(source_id).
 */
export function applyConsolidationProposal(
  sql: SqlStorage,
  proposalId: string,
  reviewerHandle: string,
): DOResult<{ ok: true; applied: true; source_id: string; target_id: string }> {
  const proposal = sql
    .exec(
      'SELECT source_id, target_id, status FROM consolidation_proposals WHERE id = ?',
      proposalId,
    )
    .toArray()[0] as Record<string, unknown> | undefined;
  if (!proposal) return { error: 'Proposal not found', code: 'NOT_FOUND' };
  if (proposal.status !== 'pending') {
    return { error: `Proposal already ${proposal.status as string}`, code: 'INVALID_STATE' };
  }

  const sourceId = proposal.source_id as string;
  const targetId = proposal.target_id as string;

  sql.exec(
    "UPDATE memories SET merged_into = ?, merged_at = datetime('now') WHERE id = ? AND merged_into IS NULL",
    targetId,
    sourceId,
  );
  sql.exec(
    "UPDATE consolidation_proposals SET status = 'applied', resolved_at = datetime('now'), resolved_by = ? WHERE id = ?",
    reviewerHandle,
    proposalId,
  );
  return { ok: true, applied: true, source_id: sourceId, target_id: targetId };
}

export function rejectConsolidationProposal(
  sql: SqlStorage,
  proposalId: string,
  reviewerHandle: string,
): DOResult<{ ok: true; rejected: true }> {
  const proposal = sql
    .exec('SELECT status FROM consolidation_proposals WHERE id = ?', proposalId)
    .toArray()[0] as Record<string, unknown> | undefined;
  if (!proposal) return { error: 'Proposal not found', code: 'NOT_FOUND' };
  if (proposal.status !== 'pending') {
    return { error: `Proposal already ${proposal.status as string}`, code: 'INVALID_STATE' };
  }
  sql.exec(
    "UPDATE consolidation_proposals SET status = 'rejected', resolved_at = datetime('now'), resolved_by = ? WHERE id = ?",
    reviewerHandle,
    proposalId,
  );
  return { ok: true, rejected: true };
}

/**
 * Restore a soft-merged memory: clear merged_into so search picks it up
 * again. Counterpart to applyConsolidationProposal — gives the agent
 * recourse when consolidation absorbed something it shouldn't have.
 */
export function unmergeMemory(
  sql: SqlStorage,
  memoryId: string,
): DOResult<{ ok: true; unmerged: true }> {
  const row = sql.exec('SELECT merged_into FROM memories WHERE id = ?', memoryId).toArray()[0] as
    | Record<string, unknown>
    | undefined;
  if (!row) return { error: 'Memory not found', code: 'NOT_FOUND' };
  if (row.merged_into === null) {
    return { error: 'Memory is not merged', code: 'INVALID_STATE' };
  }
  sql.exec('UPDATE memories SET merged_into = NULL, merged_at = NULL WHERE id = ?', memoryId);
  return { ok: true, unmerged: true };
}
