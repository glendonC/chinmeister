import { useState, type CSSProperties } from 'react';
import SectionEmpty from '../../components/SectionEmpty/SectionEmpty.js';
import styles from '../widget-shared.module.css';
import type { WidgetBodyProps, WidgetRegistry } from './types.js';
import { GhostBars, GhostStatRow } from './shared.js';

// Period-scoped: everything in here responds to the global date picker.
function MemoryActivityWidget({ analytics }: WidgetBodyProps) {
  const m = analytics.memory_usage;
  if (m.searches === 0 && m.memories_created_period === 0)
    return <GhostStatRow labels={['searches', 'hit rate', 'created']} />;
  return (
    <div className={styles.statRow}>
      <div className={styles.statBlock}>
        <span className={styles.statBlockValue}>{m.searches}</span>
        <span className={styles.statBlockLabel}>searches</span>
      </div>
      {m.search_hit_rate > 0 && (
        <div className={styles.statBlock}>
          <span className={styles.statBlockValue}>{m.search_hit_rate}%</span>
          <span className={styles.statBlockLabel}>hit rate</span>
        </div>
      )}
      <div className={styles.statBlock}>
        <span className={styles.statBlockValue}>{m.memories_created_period}</span>
        <span className={styles.statBlockLabel}>created</span>
      </div>
    </div>
  );
}

// All-time: none of these respond to the date picker. Widget renders the
// 'all-time' scope tag in its header (see WidgetRenderer).
//
// Kept lean on purpose: three blocks for lifetime memory health. The
// protection-signal counters (consolidation queue, auditor flags, secret
// blocks, soft-merges) are in the sibling MemorySafetyWidget — separating
// health from safety keeps each widget readable at 6-col width and avoids
// the 7-block density problem the 04-19 audit flagged.
function MemoryHealthWidget({ analytics }: WidgetBodyProps) {
  const m = analytics.memory_usage;
  if (m.total_memories === 0 && m.merged_memories === 0)
    return <GhostStatRow labels={['memories', 'avg age', 'stale']} />;
  return (
    <div className={styles.statRow}>
      <div className={styles.statBlock}>
        <span className={styles.statBlockValue}>{m.total_memories}</span>
        <span className={styles.statBlockLabel}>memories</span>
      </div>
      {m.avg_memory_age_days > 0 && (
        <div className={styles.statBlock}>
          <span className={styles.statBlockValue}>{Math.round(m.avg_memory_age_days)}d</span>
          <span className={styles.statBlockLabel}>avg age</span>
        </div>
      )}
      {m.stale_memories > 0 && (
        <div className={styles.statBlock}>
          <span className={styles.statBlockValue}>{m.stale_memories}</span>
          <span className={styles.statBlockLabel}>stale</span>
        </div>
      )}
    </div>
  );
}

// Period-scoped + lifetime safety signals from the memory pipeline:
//   review queue    — live consolidation proposals awaiting decision
//   auditor-flagged — formation observations recommending merge/evolve/discard
//   secrets caught  — secret-detector blocks this period
//   soft-merged     — lifetime soft-merge total (audit signal, enables unmerge)
// Labels are plain-English per the 04-19 audit's E4 copy rework — "blocked"
// was too ambiguous, "merged" gave no hint about recourse.
function MemorySafetyWidget({ analytics }: WidgetBodyProps) {
  const m = analytics.memory_usage;
  const formation = m.formation_observations_by_recommendation;
  const flagged = formation
    ? (formation.merge ?? 0) + (formation.evolve ?? 0) + (formation.discard ?? 0)
    : 0;
  const hasAny =
    m.pending_consolidation_proposals > 0 ||
    flagged > 0 ||
    m.secrets_blocked_period > 0 ||
    m.merged_memories > 0;
  if (!hasAny)
    return <GhostStatRow labels={['review queue', 'auditor-flagged', 'secrets caught']} />;
  return (
    <div className={styles.statRow}>
      {m.pending_consolidation_proposals > 0 && (
        <div className={styles.statBlock}>
          <span className={styles.statBlockValue}>{m.pending_consolidation_proposals}</span>
          <span className={styles.statBlockLabel}>review queue</span>
        </div>
      )}
      {flagged > 0 && (
        <div className={styles.statBlock}>
          <span className={styles.statBlockValue}>{flagged}</span>
          <span className={styles.statBlockLabel}>auditor-flagged</span>
        </div>
      )}
      {m.secrets_blocked_period > 0 && (
        <div className={styles.statBlock}>
          <span className={styles.statBlockValue}>{m.secrets_blocked_period}</span>
          <span className={styles.statBlockLabel}>secrets caught</span>
        </div>
      )}
      {m.merged_memories > 0 && (
        <div className={styles.statBlock}>
          <span className={styles.statBlockValue}>{m.merged_memories}</span>
          <span className={styles.statBlockLabel}>soft-merged</span>
        </div>
      )}
    </div>
  );
}

function MemoryOutcomesWidget({ analytics }: WidgetBodyProps) {
  const moc = analytics.memory_outcome_correlation;
  if (moc.length === 0) return <GhostBars count={2} />;
  return (
    <div className={styles.metricBars}>
      {moc.map((m) => (
        <div key={m.bucket} className={styles.metricRow}>
          <span className={styles.metricLabel}>{m.bucket}</span>
          <div className={styles.metricBarTrack}>
            <div
              className={styles.metricBarFill}
              style={{
                width: `${m.completion_rate}%`,
                background: 'var(--success)',
                opacity: 'var(--opacity-bar-fill)',
              }}
            />
          </div>
          <span className={styles.metricValue}>
            {m.completion_rate}% · {m.sessions}
          </span>
        </div>
      ))}
    </div>
  );
}

// Period-scoped. Shows what the formation auditor flagged for review this
// period. 'keep' is the trivial common case (most writes) — rendering it
// as a bar segment drowns the actionable merge/evolve/discard buckets at
// 90%+ of width. Per the 04-19 audit's C1 rework: drop keep from the bar,
// render only the three actionable buckets proportional to each other,
// show 'keep' as text above so the denominator is honest.
function FormationSummaryWidget({ analytics }: WidgetBodyProps) {
  const f = analytics.memory_usage.formation_observations_by_recommendation;
  const keep = f?.keep ?? 0;
  const merge = f?.merge ?? 0;
  const evolve = f?.evolve ?? 0;
  const discard = f?.discard ?? 0;
  const actionable = merge + evolve + discard;
  const classified = keep + actionable;
  if (!f || classified === 0) {
    return (
      <SectionEmpty>
        Auditor hasn&apos;t flagged any memories this period — nothing to review.
      </SectionEmpty>
    );
  }
  const buckets: Array<{ label: string; value: number; color: string }> = [
    { label: 'merge', value: merge, color: 'var(--accent)' },
    { label: 'evolve', value: evolve, color: 'var(--warning)' },
    { label: 'discard', value: discard, color: 'var(--danger)' },
  ];
  return (
    <>
      <div className={styles.coverageNote} style={{ marginTop: 0, marginBottom: 12 }}>
        {classified} classified, {actionable} flagged for review
      </div>
      <div className={styles.metricBars}>
        {buckets.map((b) => (
          <div key={b.label} className={styles.metricRow}>
            <span className={styles.metricLabel}>{b.label}</span>
            <div className={styles.metricBarTrack}>
              <div
                className={styles.metricBarFill}
                style={{
                  width: `${actionable > 0 ? (b.value / actionable) * 100 : 0}%`,
                  background: b.color,
                  opacity: 'var(--opacity-bar-fill)',
                }}
              />
            </div>
            <span className={styles.metricValue}>{b.value}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function TopMemoriesWidget({ analytics }: WidgetBodyProps) {
  // Captured at mount so relative-time math in render stays pure. Accepted
  // staleness: a long-mounted dashboard may show "Xd ago" lagging by a day
  // until next remount.
  const [nowMs] = useState(() => Date.now());
  const tm = analytics.top_memories;
  if (tm.length === 0) return <SectionEmpty>No memories accessed</SectionEmpty>;
  return (
    <div className={styles.dataList}>
      {tm.slice(0, 8).map((m, i) => {
        const daysAgo = m.last_accessed_at
          ? Math.max(0, Math.floor((nowMs - new Date(m.last_accessed_at).getTime()) / 86_400_000))
          : null;
        return (
          <div key={m.id} className={styles.dataRow} style={{ '--row-index': i } as CSSProperties}>
            <span className={styles.dataName} style={{ fontSize: 'var(--text-2xs)' }}>
              {m.text_preview}
            </span>
            <div className={styles.dataMeta}>
              <span className={styles.dataStat}>
                <span className={styles.dataStatValue}>{m.access_count}</span> hits
              </span>
              {daysAgo !== null && (
                <span className={styles.dataStat}>
                  <span className={styles.dataStatValue}>
                    {daysAgo === 0 ? 'today' : `${daysAgo}d`}
                  </span>
                  {daysAgo > 0 ? ' ago' : ''}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export const memoryWidgets: WidgetRegistry = {
  'memory-activity': MemoryActivityWidget,
  'memory-health': MemoryHealthWidget,
  'memory-safety': MemorySafetyWidget,
  'memory-outcomes': MemoryOutcomesWidget,
  'top-memories': TopMemoriesWidget,
  'formation-summary': FormationSummaryWidget,
};
