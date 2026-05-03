import { type CSSProperties, type ReactNode } from 'react';
import SectionEmpty from '../../components/SectionEmpty/SectionEmpty.js';
import SectionOverflow from '../../components/SectionOverflow/SectionOverflow.js';
import { getToolMeta } from '../../lib/toolMeta.js';
import { navigateToDetail } from '../../lib/router.js';
import { completionColor, MEMORY_OUTCOMES_MIN_SESSIONS } from '../utils.js';
import { StatWidget, visibleRowsWithOverflow } from './shared.js';
import s from './MemoryWidgets.module.css';
import type { WidgetBodyProps, WidgetRegistry } from './types.js';

/* Memory category bodies — chromeless tiles built from the same primitives
 * the live and outcomes categories use.
 *
 *   memory          → KPI hero (count + age + stale)
 *   memory hygiene  → KPI hero (pending + caption)
 *   secrets blocked → KPI hero (count + caption)
 *   freshness       → 4-bucket terrace (mirrors scope-complexity)
 *   cross-tool flow → subgrid table (mirrors live-agents)
 *   concentration   → subgrid table with hero share % per row
 *   categories      → ranked table (count bar + per-row View)
 *   outcomes        → completion lenses (equal-size ring gauges)
 *
 * One color signal per widget. Color tokens never decorate; they encode
 * tool identity (cross-tool flow) or severity tone (freshness, concentration,
 * outcomes). Mono for measurements, sans/display for identifiers.
 */

const MEMORY_OUTCOMES_MIN_BUCKET_SESSIONS = 5;
// Cockpit teasers: keep visible counts in line with files-being-edited
// (3-4 rows + overflow link). Full tables live in the corresponding detail
// views — the +N overflow pill is the route there.
const FLOW_PAIRS_NO_OVERFLOW_CAP = 4;
const FLOW_PAIRS_WITH_OVERFLOW_CAP = 3;
const SINGLE_AUTHOR_NO_OVERFLOW_CAP = 5;
const SINGLE_AUTHOR_WITH_OVERFLOW_CAP = 4;
const CATEGORIES_NO_OVERFLOW_CAP = 4;
const CATEGORIES_WITH_OVERFLOW_CAP = 3;

function fmt(n: number): string {
  return n.toLocaleString();
}

function fmtDays(n: number): string {
  return String(Math.max(0, Math.round(n)));
}

function memoryOutcomeLabel(bucket: string): string {
  if (/hit memory/i.test(bucket)) return 'with memory';
  if (/searched/i.test(bucket)) return 'searched empty';
  if (/no[-\s]search|without/i.test(bucket)) return 'without memory';
  return bucket;
}

function memoryOutcomeRank(bucket: string): number {
  if (/hit memory/i.test(bucket)) return 0;
  if (/searched/i.test(bucket)) return 1;
  if (/no[-\s]search|without/i.test(bucket)) return 2;
  return 3;
}

interface MemoryStatStripItem {
  key: string;
  value: ReactNode;
  label: string;
  tone?: 'warning' | 'idle';
}

function MemoryStatStrip({ items }: { items: MemoryStatStripItem[] }) {
  return (
    <div className={s.memoryStatStrip}>
      {items.map((item) => {
        const toneClass =
          item.tone === 'warning'
            ? s.memoryStatValueWarn
            : item.tone === 'idle'
              ? s.memoryStatValueIdle
              : '';
        return (
          <span key={item.key} className={s.memoryStatCell}>
            <span className={`${s.memoryStatValue} ${toneClass}`}>{item.value}</span>
            <span className={s.memoryStatLabel}>{item.label}</span>
          </span>
        );
      })}
    </div>
  );
}

// Severity-tinted age palette for the freshness terrace. Fresh reads as
// success, mid-age as ink, late as warn, stale as soft. Color is the only
// place the bucket boundaries register visually — the height already carries
// the count.
const AGE_COLORS: Record<string, string> = {
  '0-7d': 'var(--success)',
  '8-30d': 'var(--ink)',
  '31-90d': 'var(--warn)',
  '90d+': 'var(--soft)',
};

// ── memory (health strip: live + age + stale) ──────────

function MemoryHealthWidget({ analytics }: WidgetBodyProps) {
  const m = analytics.memory_usage;
  if (m.total_memories === 0) {
    return (
      <div className={s.kpi}>
        <div className={s.kpiHero}>
          <span className={`${s.kpiHeroValue} ${s.kpiHeroValueIdle}`}>—</span>
        </div>
        <span className={s.kpiCaption}>no memories saved yet</span>
      </div>
    );
  }
  return (
    <MemoryStatStrip
      items={[
        { key: 'live', value: fmt(m.total_memories), label: 'live' },
        { key: 'age', value: `${fmtDays(m.avg_memory_age_days)}d`, label: 'avg age' },
        {
          key: 'stale',
          value: fmt(m.stale_memories),
          label: 'stale >30d',
          tone: m.stale_memories > 0 ? 'warning' : undefined,
        },
      ]}
    />
  );
}

// ── memory freshness (4-bucket terrace) ─────────────
//
// Hero %fresh on top; the terrace silhouette below is the substantive viz.
// Heights encode bucket counts; colors encode age tone. The shape itself is
// the answer — tall left = mostly fresh, tall right = mostly stale.

function MemoryAgingCurveWidget({ analytics }: WidgetBodyProps) {
  const a = analytics.memory_aging;
  const total = a.recent_7d + a.recent_30d + a.recent_90d + a.older;
  if (total === 0) {
    return (
      <div className={s.kpi}>
        <div className={s.kpiHero}>
          <span className={`${s.kpiHeroValue} ${s.kpiHeroValueIdle}`}>—</span>
        </div>
        <span className={s.kpiCaption}>aging curve appears after first save</span>
      </div>
    );
  }
  const freshPct = Math.round(((a.recent_7d + a.recent_30d) / total) * 100);
  const buckets = [
    { key: '0-7d', label: '0–7d', count: a.recent_7d },
    { key: '8-30d', label: '8–30d', count: a.recent_30d },
    { key: '31-90d', label: '31–90d', count: a.recent_90d },
    { key: '90d+', label: '90d+', count: a.older },
  ];
  const maxCount = Math.max(...buckets.map((b) => b.count), 1);
  return (
    <div className={s.kpiSplit}>
      <div className={s.kpiHero}>
        <span className={s.kpiHeroValue}>{freshPct}</span>
        <span className={s.kpiHeroSuffix}>% fresh</span>
      </div>
      <div className={s.terrace}>
        <div className={s.terraceViz}>
          {buckets.map((b, i) => (
            <span
              key={b.key}
              className={s.terraceStep}
              style={
                {
                  '--step-h': `${(b.count / maxCount) * 100}%`,
                  '--step-color': AGE_COLORS[b.key],
                  '--row-index': i,
                } as CSSProperties
              }
              title={`${b.label}: ${b.count}`}
            />
          ))}
        </div>
        <div className={s.terraceLabels}>
          {buckets.map((b, i) => (
            <span
              key={b.key}
              className={s.terraceLabel}
              style={{ '--row-index': i } as CSSProperties}
            >
              <span className={s.terraceCount}>{b.count}</span>
              <span className={s.terraceBucket}>{b.label}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── memory across tools (subgrid table) ─────────────
//
// FROM | TO | READS | SESSIONS — same shape as live-agents. Tool-color
// dot beside each tool label. No bars; ranking is implicit in row order.
// Counts are actual reads off the memory_search_results join, not the
// available-to-read pool.

function MemoryCrossToolFlowWidget({ analytics }: WidgetBodyProps) {
  const flow = analytics.cross_tool_memory_flow;
  if (flow.length === 0) {
    return (
      <SectionEmpty>
        Cross-tool flow appears once one tool&apos;s sessions read another tool&apos;s memories.
      </SectionEmpty>
    );
  }
  const sorted = [...flow].sort((a, b) => b.memories_read - a.memories_read);
  const visible = sorted.slice(
    0,
    visibleRowsWithOverflow(
      sorted.length,
      FLOW_PAIRS_NO_OVERFLOW_CAP,
      FLOW_PAIRS_WITH_OVERFLOW_CAP,
    ),
  );
  const hidden = sorted.length - visible.length;
  const open = () => navigateToDetail('memory', 'cross-tool', 'flow');
  return (
    <div className={s.flowTable}>
      <div className={s.tableHeader}>
        <span>From</span>
        <span>To</span>
        <span className={s.tableHeaderNum}>Reads</span>
        <span className={s.tableHeaderNum}>Sessions</span>
        <span aria-hidden="true" />
      </div>
      <div className={s.tableBody}>
        {visible.map((f, i) => {
          const from = getToolMeta(f.author_tool);
          const to = getToolMeta(f.consumer_tool);
          return (
            <button
              key={`${f.author_tool}-${f.consumer_tool}`}
              type="button"
              className={s.tableRow}
              style={{ '--row-index': i } as CSSProperties}
              onClick={open}
              aria-label={`Open cross-tool memory · ${from.label} to ${to.label}, ${fmt(f.memories_read)} reads in ${fmt(f.reading_sessions)} sessions`}
            >
              <span className={s.tableTool}>
                <span className={s.tableToolDot} style={{ background: from.color }} />
                <span className={s.tableToolName}>{from.label}</span>
              </span>
              <span className={s.tableTool}>
                <span className={s.tableToolDot} style={{ background: to.color }} />
                <span className={s.tableToolName}>{to.label}</span>
              </span>
              <span className={s.tableNum}>{fmt(f.memories_read)}</span>
              <span className={s.tableNumSecondary}>{fmt(f.reading_sessions)}</span>
              <span className={s.tableViewButton}>View</span>
            </button>
          );
        })}
      </div>
      {hidden > 0 && (
        <div className={s.tableOverflow}>
          <SectionOverflow count={hidden} label="pairs" onClick={open} />
        </div>
      )}
    </div>
  );
}

// ── memory concentration (subgrid table, share bar) ─────
//
// DIRECTORY | SHARE | COUNT — share is a horizontal bar with a mono % beside
// it. Bar fills 0-100% (it's already a ratio), severity-tinted --warn at the
// ≥80% threshold. Same fillTrack/fillBar primitives the codebase risk tables
// use, so concentration speaks the same vocabulary as file-rework.

function MemoryBusFactorWidget({ analytics }: WidgetBodyProps) {
  const dirs = analytics.memory_single_author_directories;
  if (dirs.length === 0) {
    return (
      <SectionEmpty>
        Concentration surfaces when 2+ authors save memories and a directory has only one.
      </SectionEmpty>
    );
  }
  const sorted = [...dirs].sort((a, b) => {
    const sa = a.total_count > 0 ? a.single_author_count / a.total_count : 0;
    const sb = b.total_count > 0 ? b.single_author_count / b.total_count : 0;
    return sb - sa;
  });
  const visible = sorted.slice(
    0,
    visibleRowsWithOverflow(
      sorted.length,
      SINGLE_AUTHOR_NO_OVERFLOW_CAP,
      SINGLE_AUTHOR_WITH_OVERFLOW_CAP,
    ),
  );
  const hidden = sorted.length - visible.length;
  const open = () => navigateToDetail('memory', 'authorship', 'concentration');
  return (
    <div className={s.concTable}>
      <div className={s.tableHeader}>
        <span>Directory</span>
        <span>Share</span>
        <span className={s.tableHeaderNum}>Count</span>
        <span aria-hidden="true" />
      </div>
      <div className={s.tableBody}>
        {visible.map((d, i) => {
          const share = d.total_count > 0 ? d.single_author_count / d.total_count : 0;
          const sharePct = Math.round(share * 100);
          const severe = share >= 0.8;
          return (
            <button
              key={d.directory}
              type="button"
              className={s.tableRow}
              style={{ '--row-index': i } as CSSProperties}
              onClick={open}
              aria-label={`Open memory authorship · ${d.directory}, ${sharePct}% from one author (${d.single_author_count} of ${d.total_count})`}
              title={d.directory}
            >
              <span className={s.concPath}>{d.directory}</span>
              <span className={s.concShareCell}>
                <span className={s.concShareTrack}>
                  <span
                    className={severe ? s.concShareFillSevere : s.concShareFill}
                    style={{ width: `${sharePct}%` }}
                  />
                </span>
                <span className={severe ? s.concShareValueSevere : s.concShareValue}>
                  {sharePct}%
                </span>
              </span>
              <span className={s.tableNumSecondary}>
                {d.single_author_count}/{d.total_count}
              </span>
              <span className={s.tableViewButton}>View</span>
            </button>
          );
        })}
      </div>
      {hidden > 0 && (
        <div className={s.tableOverflow}>
          <SectionOverflow count={hidden} label="directories" onClick={open} />
        </div>
      )}
    </div>
  );
}

// ── knowledge categories (ranked tag table) ────────
//
// TAG | MEMORIES | VIEW. Counts get a proportional fill so the reader sees
// distribution immediately, while the row still follows the table + View
// convention used by the rest of the memory category.

function MemoryCategoriesWidget({ analytics }: WidgetBodyProps) {
  const cats = analytics.memory_categories;
  if (cats.length === 0) {
    return <SectionEmpty>Categories appear when agents tag memories on save.</SectionEmpty>;
  }
  const visible = cats.slice(
    0,
    visibleRowsWithOverflow(cats.length, CATEGORIES_NO_OVERFLOW_CAP, CATEGORIES_WITH_OVERFLOW_CAP),
  );
  const hidden = cats.length - visible.length;
  const maxCount = Math.max(...visible.map((c) => c.count), 1);
  const open = () => navigateToDetail('memory', 'health', 'top-tags');
  return (
    <>
      <div className={s.catTable}>
        <div className={s.catHeader}>
          <span>Tag</span>
          <span>Memories</span>
          <span aria-hidden="true" />
        </div>
        {visible.map((c, i) => {
          return (
            <button
              key={c.category}
              type="button"
              className={s.catRow}
              style={{ '--row-index': i } as CSSProperties}
              onClick={open}
              aria-label={`Open memory categories · ${c.category}, ${fmt(c.count)} memories`}
            >
              <span className={s.catTag}>{c.category}</span>
              <span className={s.catMetric}>
                <span className={s.catTrack}>
                  <span
                    className={i === 0 ? s.catFillLead : s.catFill}
                    style={{ width: `${(c.count / maxCount) * 100}%` }}
                  />
                </span>
                <span className={s.catCount}>{fmt(c.count)}</span>
              </span>
              <span className={s.tableViewButton}>View</span>
            </button>
          );
        })}
      </div>
      <SectionOverflow count={hidden} label="categories" onClick={open} />
    </>
  );
}

// ── outcomes by memory (completion lenses) ──────────
//
// Equal-size lenses per bucket. Arc length encodes completion rate; sample
// size stays as text so n never becomes a hidden area/height channel.

function MemoryOutcomesWidget({ analytics }: WidgetBodyProps) {
  const moc = analytics.memory_outcome_correlation;
  const totalSessions = moc.reduce((sum, m) => sum + m.sessions, 0);
  if (totalSessions === 0) return <SectionEmpty>No sessions this period.</SectionEmpty>;
  if (totalSessions < MEMORY_OUTCOMES_MIN_SESSIONS) {
    return (
      <SectionEmpty>
        Need {MEMORY_OUTCOMES_MIN_SESSIONS}+ sessions for a reliable correlation.
      </SectionEmpty>
    );
  }
  // Per-bucket floor: a bucket with 1-2 sessions can render 100% completion
  // and read as "memory works" when it's just noise. Drop sub-floor buckets,
  // and require at least two cleared buckets so the chart is a comparison,
  // not a lone bar.
  const visible = moc
    .filter((m) => m.sessions >= MEMORY_OUTCOMES_MIN_BUCKET_SESSIONS)
    .sort((a, b) => memoryOutcomeRank(a.bucket) - memoryOutcomeRank(b.bucket));
  if (visible.length < 2) {
    return (
      <SectionEmpty>
        Need {MEMORY_OUTCOMES_MIN_BUCKET_SESSIONS}+ sessions in 2+ buckets to compare.
      </SectionEmpty>
    );
  }
  return (
    <div className={s.outcomeLenses}>
      {visible.map((m, i) => {
        const tone = completionColor(m.completion_rate);
        const label = memoryOutcomeLabel(m.bucket);
        const dash = Math.max(0, Math.min(100, m.completion_rate));
        return (
          <div
            key={m.bucket}
            className={s.outcomeLens}
            style={
              {
                '--row-index': i,
                '--lens-color': tone,
                '--lens-dash': dash,
              } as CSSProperties
            }
          >
            <span className={s.outcomeLensChart}>
              <svg
                className={s.outcomeLensSvg}
                viewBox="0 0 120 120"
                role="img"
                aria-label={`${label}: ${m.completion_rate}% complete, ${fmt(m.completed)} of ${fmt(m.sessions)} sessions`}
              >
                <circle className={s.outcomeLensTrack} cx="60" cy="60" r="46" pathLength="100" />
                <circle className={s.outcomeLensArc} cx="60" cy="60" r="46" pathLength="100" />
              </svg>
              <span className={s.outcomeLensRate}>{m.completion_rate}%</span>
            </span>
            <span className={s.outcomeLensLabel}>{label}</span>
            <span className={s.outcomeLensMeta}>
              {fmt(m.completed)} of {fmt(m.sessions)} sessions
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── memory hygiene (status strip: invalidated + merged + pending) ──

function MemorySupersessionFlowWidget({ analytics }: WidgetBodyProps) {
  const sup = analytics.memory_supersession;
  const idle =
    sup.pending_proposals === 0 && sup.invalidated_period === 0 && sup.merged_period === 0;
  return (
    <MemoryStatStrip
      items={[
        {
          key: 'invalidated',
          value: fmt(sup.invalidated_period),
          label: 'invalidated',
          tone: idle ? 'idle' : undefined,
        },
        {
          key: 'merged',
          value: fmt(sup.merged_period),
          label: 'merged',
          tone: idle ? 'idle' : undefined,
        },
        {
          key: 'pending',
          value: fmt(sup.pending_proposals),
          label: 'pending',
          tone: sup.pending_proposals > 0 ? 'warning' : idle ? 'idle' : undefined,
        },
      ]}
    />
  );
}

// ── secrets blocked (period stat) ──

function MemorySecretsShieldWidget({ analytics }: WidgetBodyProps) {
  const ss = analytics.memory_secrets_shield;
  return (
    <StatWidget
      value={fmt(ss.blocked_period)}
      onOpenDetail={() => navigateToDetail('memory', 'health', 'secrets')}
      detailAriaLabel={`Open secrets blocked detail, ${fmt(ss.blocked_period)} blocked this period`}
    />
  );
}

export const memoryWidgets: WidgetRegistry = {
  'memory-outcomes': MemoryOutcomesWidget,
  'memory-cross-tool-flow': MemoryCrossToolFlowWidget,
  'memory-aging-curve': MemoryAgingCurveWidget,
  'memory-categories': MemoryCategoriesWidget,
  'memory-health': MemoryHealthWidget,
  'memory-bus-factor': MemoryBusFactorWidget,
  'memory-supersession-flow': MemorySupersessionFlowWidget,
  'memory-secrets-shield': MemorySecretsShieldWidget,
};
