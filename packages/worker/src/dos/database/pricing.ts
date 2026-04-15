// Model pricing snapshot and metadata — lives in DatabaseDO as globally-shared
// data, refreshed every 6h from LiteLLM by src/lib/refresh-model-prices.ts.
//
// This module exports pure functions that take a SqlStorage handle. The
// DatabaseDO class wires them as async RPC methods in index.ts so route
// handlers and the scheduled handler can call them uniformly.
//
// Atomicity: upsertModelPricesTxn wraps DELETE + INSERT + metadata UPDATE in
// a single transact() call so readers never see a partial refresh. Readers
// that query while a refresh is mid-flight will see the pre-refresh snapshot
// in its entirety, then the post-refresh snapshot in its entirety — never a
// mix. This is why the read path (getModelPricesSnapshot) does NOT need its
// own transaction; SQLite-in-DO serializes reads and writes already.

export interface ModelPriceRow {
  canonical_name: string;
  input_per_1m: number;
  output_per_1m: number;
  cache_creation_per_1m: number | null;
  cache_read_per_1m: number | null;
  input_per_1m_above_200k: number | null;
  output_per_1m_above_200k: number | null;
  max_input_tokens: number | null;
  max_output_tokens: number | null;
  /** Full LiteLLM entry as JSON string, for future tier access without schema churn. */
  raw: string | null;
  updated_at: string;
}

export interface PricingMetadata {
  source: string;
  source_sha: string | null;
  etag: string | null;
  fetched_at: string;
  models_count: number;
  last_attempt_at: string | null;
  last_failure_at: string | null;
  last_failure_reason: string | null;
}

export interface ModelPricesSnapshot {
  rows: ModelPriceRow[];
  metadata: PricingMetadata | null;
}

/**
 * Shape of the bundled pricing-seed.json artifact. Written at build time by
 * scripts/fetch-pricing-seed.ts, read on cold start if model_prices is empty.
 * Do not hand-edit; `npm run build:pricing-seed` regenerates it.
 */
export interface BundledPricingSeed {
  _sha: string;
  _fetchedAt: string;
  _models_count: number;
  models: Omit<ModelPriceRow, 'updated_at'>[];
}

// -- Input to upsert (no updated_at; we set it inline) --

export interface ModelPriceInput {
  canonical_name: string;
  input_per_1m: number;
  output_per_1m: number;
  cache_creation_per_1m: number | null;
  cache_read_per_1m: number | null;
  input_per_1m_above_200k: number | null;
  output_per_1m_above_200k: number | null;
  max_input_tokens: number | null;
  max_output_tokens: number | null;
  raw: string | null;
}

export interface PricingMetadataInput {
  source: string;
  source_sha: string | null;
  etag: string | null;
  fetched_at: string;
  models_count: number;
}

// -- Reads --

/** Return every priced model plus the latest metadata row, or empty snapshot. */
export function getModelPricesSnapshot(sql: SqlStorage): ModelPricesSnapshot {
  const rows = sql
    .exec(
      `SELECT canonical_name, input_per_1m, output_per_1m,
              cache_creation_per_1m, cache_read_per_1m,
              input_per_1m_above_200k, output_per_1m_above_200k,
              max_input_tokens, max_output_tokens, raw, updated_at
         FROM model_prices`,
    )
    .toArray() as unknown as ModelPriceRow[];

  const metaRows = sql
    .exec(
      `SELECT source, source_sha, etag, fetched_at, models_count,
              last_attempt_at, last_failure_at, last_failure_reason
         FROM pricing_metadata WHERE id = 1`,
    )
    .toArray() as unknown as PricingMetadata[];

  return { rows, metadata: metaRows[0] ?? null };
}

/** Lightweight metadata-only read for the refresh loop (ETag, SHA, staleness). */
export function getPricingMetadata(sql: SqlStorage): PricingMetadata | null {
  const rows = sql
    .exec(
      `SELECT source, source_sha, etag, fetched_at, models_count,
              last_attempt_at, last_failure_at, last_failure_reason
         FROM pricing_metadata WHERE id = 1`,
    )
    .toArray() as unknown as PricingMetadata[];
  return rows[0] ?? null;
}

/** Count rows in model_prices — used by seedFromBundled to decide whether to seed. */
export function getModelPricesCount(sql: SqlStorage): number {
  const rows = sql.exec('SELECT COUNT(*) AS n FROM model_prices').toArray();
  return (rows[0] as { n: number }).n;
}

// -- Writes --

/**
 * Atomic refresh: delete all existing rows, insert the new snapshot, and
 * upsert the metadata row — all in one transaction so a reader never sees a
 * half-refreshed table. The caller provides the `transact` helper bound to
 * the DO's ctx.storage.transactionSync.
 */
export function upsertModelPricesTxn(
  sql: SqlStorage,
  transact: <T>(fn: () => T) => T,
  rows: ModelPriceInput[],
  metadata: PricingMetadataInput,
): void {
  transact(() => {
    sql.exec('DELETE FROM model_prices');

    const now = new Date().toISOString();
    for (const r of rows) {
      sql.exec(
        `INSERT INTO model_prices (
           canonical_name, input_per_1m, output_per_1m,
           cache_creation_per_1m, cache_read_per_1m,
           input_per_1m_above_200k, output_per_1m_above_200k,
           max_input_tokens, max_output_tokens, raw, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        r.canonical_name,
        r.input_per_1m,
        r.output_per_1m,
        r.cache_creation_per_1m,
        r.cache_read_per_1m,
        r.input_per_1m_above_200k,
        r.output_per_1m_above_200k,
        r.max_input_tokens,
        r.max_output_tokens,
        r.raw,
        now,
      );
    }

    // Upsert the singleton metadata row.
    sql.exec(
      `INSERT INTO pricing_metadata (
         id, source, source_sha, etag, fetched_at, models_count, last_attempt_at
       ) VALUES (1, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         source = excluded.source,
         source_sha = excluded.source_sha,
         etag = excluded.etag,
         fetched_at = excluded.fetched_at,
         models_count = excluded.models_count,
         last_attempt_at = excluded.last_attempt_at,
         last_failure_at = NULL,
         last_failure_reason = NULL`,
      metadata.source,
      metadata.source_sha,
      metadata.etag,
      metadata.fetched_at,
      metadata.models_count,
      now,
    );
  });
}

/**
 * Record a refresh attempt that failed, preserving the existing model_prices
 * rows (stale data is better than no data — the read path decides when
 * staleness is bad enough to return null).
 */
export function recordRefreshFailure(
  sql: SqlStorage,
  transact: <T>(fn: () => T) => T,
  reason: string,
): void {
  const now = new Date().toISOString();
  transact(() => {
    // If metadata row doesn't exist yet (very first refresh attempt failed
    // before any successful write), we still want the failure recorded. Use
    // INSERT ... ON CONFLICT to cover both cases. Source defaults to 'unknown'
    // on a first-attempt failure — a successful refresh will overwrite it.
    sql.exec(
      `INSERT INTO pricing_metadata (
         id, source, fetched_at, models_count, last_attempt_at,
         last_failure_at, last_failure_reason
       ) VALUES (1, 'unknown', ?, 0, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         last_attempt_at = excluded.last_attempt_at,
         last_failure_at = excluded.last_failure_at,
         last_failure_reason = excluded.last_failure_reason`,
      now,
      now,
      now,
      reason.slice(0, 500),
    );
  });
}

/**
 * Populate model_prices from a bundled snapshot on cold-start IF empty.
 * Used for fresh deploys where the cron hasn't fired yet. No-op if the
 * table already has rows (the cron-refreshed data is always preferred).
 */
export function seedFromBundled(
  sql: SqlStorage,
  transact: <T>(fn: () => T) => T,
  bundled: BundledPricingSeed,
): boolean {
  if (getModelPricesCount(sql) > 0) return false;

  const rows: ModelPriceInput[] = bundled.models.map((m) => ({
    canonical_name: m.canonical_name,
    input_per_1m: m.input_per_1m,
    output_per_1m: m.output_per_1m,
    cache_creation_per_1m: m.cache_creation_per_1m,
    cache_read_per_1m: m.cache_read_per_1m,
    input_per_1m_above_200k: m.input_per_1m_above_200k,
    output_per_1m_above_200k: m.output_per_1m_above_200k,
    max_input_tokens: m.max_input_tokens,
    max_output_tokens: m.max_output_tokens,
    raw: m.raw,
  }));

  upsertModelPricesTxn(sql, transact, rows, {
    source: 'bundled-seed',
    source_sha: bundled._sha,
    etag: null,
    fetched_at: bundled._fetchedAt,
    models_count: bundled._models_count,
  });

  return true;
}
