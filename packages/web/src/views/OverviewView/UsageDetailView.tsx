import { useMemo, type CSSProperties } from 'react';
import clsx from 'clsx';
import BackLink from '../../components/BackLink/BackLink.js';
import KeyboardHint from '../../components/KeyboardHint/KeyboardHint.jsx';
import ToolIcon from '../../components/ToolIcon/ToolIcon.js';
import { useTabs } from '../../hooks/useTabs.js';
import { getToolMeta } from '../../lib/toolMeta.js';
import { Sparkline } from '../../widgets/charts.js';
import type { UserAnalytics } from '../../lib/apiSchemas.js';
import styles from './UsageDetailView.module.css';

const USAGE_TABS = ['sessions', 'edits', 'cost', 'cost-per-edit', 'files-touched'] as const;
type UsageTab = (typeof USAGE_TABS)[number];

function isUsageTab(value: string | null | undefined): value is UsageTab {
  return (USAGE_TABS as readonly string[]).includes(value ?? '');
}

interface Props {
  analytics: UserAnalytics;
  initialTab?: string | null;
  onBack: () => void;
}

// Formatting helpers kept inline so the detail view is self-contained.
function fmtCount(n: number): string {
  return n.toLocaleString();
}
function fmtUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}
function fmtUsdFine(n: number): string {
  return `$${n.toFixed(3)}`;
}
function fmtPct(n: number, digits = 0): string {
  return `${(n * 100).toFixed(digits)}%`;
}

function deltaMark(
  current: number,
  previous: number | null | undefined,
  invert = false,
): { arrow: string; color: string; magnitude: string } | null {
  if (previous == null || previous === 0) return null;
  const d = current - previous;
  if (d === 0) return { arrow: '→', color: 'var(--muted)', magnitude: '0' };
  const isGood = invert ? d < 0 : d > 0;
  return {
    arrow: d > 0 ? '↑' : '↓',
    color: isGood ? 'var(--success)' : 'var(--danger)',
    magnitude: String(Math.abs(Math.round(d * 10) / 10)),
  };
}

export default function UsageDetailView({ analytics, initialTab, onBack }: Props) {
  const totals = useMemo(() => {
    const sessions = analytics.daily_trends.reduce((s, d) => s + d.sessions, 0);
    const edits = analytics.daily_trends.reduce((s, d) => s + d.edits, 0);
    const cost = analytics.token_usage.total_estimated_cost_usd;
    const cpe = analytics.token_usage.cost_per_edit;
    const filesTouched = analytics.file_heatmap.length;
    return { sessions, edits, cost, cpe, filesTouched };
  }, [analytics]);

  const resolvedInitialTab: UsageTab = isUsageTab(initialTab) ? initialTab : 'sessions';
  const { activeTab, setActiveTab, hint, ref: tabsRef } = useTabs(USAGE_TABS, resolvedInitialTab);

  const tabs: Array<{ id: UsageTab; label: string; value: string }> = [
    { id: 'sessions', label: 'Sessions', value: fmtCount(totals.sessions) },
    { id: 'edits', label: 'Edits', value: fmtCount(totals.edits) },
    {
      id: 'cost',
      label: 'Cost',
      value: analytics.token_usage.sessions_with_token_data === 0 ? '--' : fmtUsd(totals.cost),
    },
    {
      id: 'cost-per-edit',
      label: 'Cost / edit',
      value: totals.cpe == null ? '--' : fmtUsdFine(totals.cpe),
    },
    { id: 'files-touched', label: 'Files', value: fmtCount(totals.filesTouched) },
  ];

  return (
    <div className={styles.detail}>
      <header className={styles.header}>
        <BackLink label="Overview" onClick={onBack} />
        <h1 className={styles.title}>usage</h1>
        <span className={styles.subtitle}>
          Last {analytics.period_days} days · {fmtCount(totals.sessions)} sessions captured
        </span>
      </header>

      <div className={styles.tabsRow} ref={tabsRef} role="tablist" aria-label="Usage sections">
        {tabs.map((t, i) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={activeTab === t.id}
            aria-controls={`usage-panel-${t.id}`}
            data-tab={t.id}
            tabIndex={activeTab === t.id ? 0 : -1}
            className={clsx(styles.tabButton, activeTab === t.id && styles.tabActive)}
            style={{ '--tab-index': i } as CSSProperties}
            onClick={(e) => {
              e.currentTarget.focus();
              setActiveTab(t.id);
            }}
          >
            <span className={styles.tabLabel}>
              {t.label}
              {activeTab === t.id && <KeyboardHint {...hint} />}
            </span>
            <span className={styles.tabValue}>{t.value}</span>
          </button>
        ))}
      </div>

      <div className={styles.panel} role="tabpanel" id={`usage-panel-${activeTab}`}>
        {activeTab === 'sessions' && <SessionsPanel analytics={analytics} />}
        {activeTab === 'edits' && <EditsPanel analytics={analytics} />}
        {activeTab === 'cost' && <CostPanel analytics={analytics} />}
        {activeTab === 'cost-per-edit' && <CostPerEditPanel analytics={analytics} />}
        {activeTab === 'files-touched' && <FilesTouchedPanel analytics={analytics} />}
      </div>
    </div>
  );
}

// ── Sessions tab (fully fleshed) ─────────────────

function SessionsPanel({ analytics }: { analytics: UserAnalytics }) {
  const cs = analytics.completion_summary;
  const totalSessions = analytics.daily_trends.reduce((s, d) => s + d.sessions, 0);
  const pc = analytics.period_comparison;
  const d = deltaMark(pc.current.total_sessions, pc.previous?.total_sessions ?? null);

  const outcomeItems = useMemo(
    () =>
      [
        { key: 'completed', count: cs.completed, color: 'var(--success)', label: 'completed' },
        { key: 'abandoned', count: cs.abandoned, color: 'var(--warn)', label: 'abandoned' },
        { key: 'failed', count: cs.failed, color: 'var(--danger)', label: 'failed' },
        { key: 'unknown', count: cs.unknown, color: 'var(--ghost)', label: 'no outcome' },
      ].filter((i) => i.count > 0),
    [cs],
  );

  const byTool = useMemo(() => {
    return [...analytics.tool_comparison]
      .filter((t) => t.sessions > 0)
      .sort((a, b) => b.sessions - a.sessions);
  }, [analytics]);

  const maxToolSessions = Math.max(1, ...byTool.map((t) => t.sessions));
  const durationDist = analytics.duration_distribution.filter((b) => b.count > 0);
  const maxDuration = Math.max(1, ...durationDist.map((b) => b.count));
  const dailySessions = analytics.daily_trends.map((d) => d.sessions);

  if (totalSessions === 0) {
    return <span className={styles.empty}>No sessions captured in this window.</span>;
  }

  return (
    <>
      {/* Outcome split */}
      {cs.total_sessions > 0 && (
        <section className={styles.section}>
          <span className={styles.sectionLabel}>
            Outcome split
            {d && (
              <span style={{ color: d.color, marginLeft: 10 }}>
                {d.arrow} {d.magnitude} vs last period
              </span>
            )}
          </span>
          <div className={styles.outcomeBar}>
            {outcomeItems.map((i) => (
              <div
                key={i.key}
                className={styles.outcomeSegment}
                style={{
                  width: `${(i.count / cs.total_sessions) * 100}%`,
                  background: i.color,
                  opacity: i.key === 'unknown' ? 1 : 'var(--opacity-bar-fill)',
                }}
              />
            ))}
          </div>
          <div className={styles.outcomeLegend}>
            {outcomeItems.map((i) => (
              <div key={i.key} className={styles.outcomeItem}>
                <span className={styles.outcomeDot} style={{ background: i.color }} />
                <span className={styles.outcomeValue}>{fmtCount(i.count)}</span>
                <span className={styles.outcomeLabel}>{i.label}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* By tool */}
      {byTool.length > 0 && (
        <section className={styles.section}>
          <span className={styles.sectionLabel}>By tool</span>
          <div className={styles.breakdownList}>
            {byTool.map((t, i) => {
              const meta = getToolMeta(t.host_tool);
              return (
                <div
                  key={t.host_tool}
                  className={styles.breakdownRow}
                  style={{ '--row-index': i } as CSSProperties}
                >
                  <span className={styles.breakdownLabel}>
                    <ToolIcon tool={t.host_tool} size={14} />
                    {meta.label}
                  </span>
                  <div className={styles.breakdownTrack}>
                    <div
                      className={styles.breakdownFill}
                      style={{
                        width: `${(t.sessions / maxToolSessions) * 100}%`,
                        background: meta.color,
                      }}
                    />
                  </div>
                  <span className={styles.breakdownValue}>
                    {fmtCount(t.sessions)}
                    <span className={styles.breakdownMeta}>
                      {' '}
                      · {fmtPct(t.completion_rate, 0)} done
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Duration distribution */}
      {durationDist.length > 0 && (
        <section className={styles.section}>
          <span className={styles.sectionLabel}>Session duration</span>
          <div className={styles.bucketList}>
            {durationDist.map((b, i) => (
              <div
                key={b.bucket}
                className={styles.bucketRow}
                style={{ '--row-index': i } as CSSProperties}
              >
                <span className={styles.bucketLabel}>{b.bucket}</span>
                <div className={styles.breakdownTrack}>
                  <div
                    className={styles.breakdownFill}
                    style={{ width: `${(b.count / maxDuration) * 100}%` }}
                  />
                </div>
                <span className={styles.bucketCount}>{fmtCount(b.count)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Daily trend */}
      {dailySessions.length >= 2 && (
        <section className={styles.section}>
          <span className={styles.sectionLabel}>Daily trend</span>
          <div className={styles.trendFrame}>
            <Sparkline data={dailySessions} height={96} />
          </div>
        </section>
      )}
    </>
  );
}

// ── Edits tab ────────────────────────────────────

function EditsPanel({ analytics }: { analytics: UserAnalytics }) {
  const total = analytics.daily_trends.reduce((s, d) => s + d.edits, 0);
  const dailyEdits = analytics.daily_trends.map((d) => d.edits);
  const byTool = [...analytics.tool_comparison]
    .filter((t) => t.total_edits > 0)
    .sort((a, b) => b.total_edits - a.total_edits);
  const maxEdits = Math.max(1, ...byTool.map((t) => t.total_edits));
  const topFiles = [...analytics.file_heatmap]
    .sort((a, b) => b.touch_count - a.touch_count)
    .slice(0, 10);

  if (total === 0) {
    return <span className={styles.empty}>No edits captured in this window.</span>;
  }

  return (
    <>
      {byTool.length > 0 && (
        <section className={styles.section}>
          <span className={styles.sectionLabel}>By tool</span>
          <div className={styles.breakdownList}>
            {byTool.map((t, i) => {
              const meta = getToolMeta(t.host_tool);
              return (
                <div
                  key={t.host_tool}
                  className={styles.breakdownRow}
                  style={{ '--row-index': i } as CSSProperties}
                >
                  <span className={styles.breakdownLabel}>
                    <ToolIcon tool={t.host_tool} size={14} />
                    {meta.label}
                  </span>
                  <div className={styles.breakdownTrack}>
                    <div
                      className={styles.breakdownFill}
                      style={{
                        width: `${(t.total_edits / maxEdits) * 100}%`,
                        background: meta.color,
                      }}
                    />
                  </div>
                  <span className={styles.breakdownValue}>{fmtCount(t.total_edits)}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {topFiles.length > 0 && (
        <section className={styles.section}>
          <span className={styles.sectionLabel}>Most-touched files</span>
          <ul className={styles.fileList}>
            {topFiles.map((f, i) => (
              <li
                key={f.file}
                className={styles.fileRow}
                style={{ '--row-index': i } as CSSProperties}
              >
                <span className={styles.fileName} title={f.file}>
                  {f.file}
                </span>
                <span className={styles.fileMeta}>{fmtCount(f.touch_count)} touches</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {dailyEdits.length >= 2 && (
        <section className={styles.section}>
          <span className={styles.sectionLabel}>Daily trend</span>
          <div className={styles.trendFrame}>
            <Sparkline data={dailyEdits} height={96} />
          </div>
        </section>
      )}
    </>
  );
}

// ── Cost tab ─────────────────────────────────────

function CostPanel({ analytics }: { analytics: UserAnalytics }) {
  const t = analytics.token_usage;
  if (t.sessions_with_token_data === 0) {
    return (
      <span className={styles.empty}>No tools in this window captured token or cost data yet.</span>
    );
  }
  const byModel = [...t.by_model].sort(
    (a, b) => (b.estimated_cost_usd ?? 0) - (a.estimated_cost_usd ?? 0),
  );
  const maxModelCost = Math.max(1, ...byModel.map((m) => m.estimated_cost_usd ?? 0));
  const byTool = [...t.by_tool].sort((a, b) => b.input_tokens - a.input_tokens);
  const maxToolTokens = Math.max(1, ...byTool.map((m) => m.input_tokens + m.cache_read_tokens));

  return (
    <>
      {byModel.length > 0 && (
        <section className={styles.section}>
          <span className={styles.sectionLabel}>By model</span>
          <div className={styles.breakdownList}>
            {byModel.map((m, i) => (
              <div
                key={m.agent_model}
                className={styles.breakdownRow}
                style={{ '--row-index': i } as CSSProperties}
              >
                <span className={styles.breakdownLabel}>{m.agent_model}</span>
                <div className={styles.breakdownTrack}>
                  <div
                    className={styles.breakdownFill}
                    style={{ width: `${((m.estimated_cost_usd ?? 0) / maxModelCost) * 100}%` }}
                  />
                </div>
                <span className={styles.breakdownValue}>
                  {m.estimated_cost_usd == null ? '--' : fmtUsd(m.estimated_cost_usd)}
                  <span className={styles.breakdownMeta}> · {fmtCount(m.sessions)} sessions</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {byTool.length > 0 && (
        <section className={styles.section}>
          <span className={styles.sectionLabel}>By tool (input + cache read)</span>
          <div className={styles.breakdownList}>
            {byTool.map((m, i) => {
              const meta = getToolMeta(m.host_tool);
              const tokens = m.input_tokens + m.cache_read_tokens;
              return (
                <div
                  key={m.host_tool}
                  className={styles.breakdownRow}
                  style={{ '--row-index': i } as CSSProperties}
                >
                  <span className={styles.breakdownLabel}>
                    <ToolIcon tool={m.host_tool} size={14} />
                    {meta.label}
                  </span>
                  <div className={styles.breakdownTrack}>
                    <div
                      className={styles.breakdownFill}
                      style={{
                        width: `${(tokens / maxToolTokens) * 100}%`,
                        background: meta.color,
                      }}
                    />
                  </div>
                  <span className={styles.breakdownValue}>
                    {fmtCount(Math.round(tokens / 1000))}k tok
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {t.cache_hit_rate != null && (
        <section className={styles.section}>
          <span className={styles.sectionLabel}>Cache efficiency</span>
          <div className={styles.outcomeLegend}>
            <div className={styles.outcomeItem}>
              <span className={styles.outcomeValue}>{fmtPct(t.cache_hit_rate, 1)}</span>
              <span className={styles.outcomeLabel}>
                {fmtCount(Math.round(t.total_cache_read_tokens / 1000))}k of{' '}
                {fmtCount(Math.round((t.total_input_tokens + t.total_cache_read_tokens) / 1000))}k
                input tokens served from cache
              </span>
            </div>
          </div>
        </section>
      )}
    </>
  );
}

// ── Cost-per-edit tab ────────────────────────────

function CostPerEditPanel({ analytics }: { analytics: UserAnalytics }) {
  const cpe = analytics.token_usage.cost_per_edit;
  const byTool = analytics.token_usage.by_tool;
  const toolCompare = new Map(analytics.tool_comparison.map((t) => [t.host_tool, t.total_edits]));

  if (cpe == null) {
    return (
      <span className={styles.empty}>
        Cost per edit needs sessions with both token and edit data — none recorded yet.
      </span>
    );
  }

  const perTool = byTool
    .map((m) => {
      const edits = toolCompare.get(m.host_tool) ?? 0;
      // Rough per-tool cost estimate: proportional input-token share of total
      // cost. Accurate breakdown would need model-joined math; this stays
      // coarse and honest.
      const inputShare =
        (m.input_tokens + m.cache_read_tokens * 0.1) /
        Math.max(
          1,
          analytics.token_usage.total_input_tokens +
            analytics.token_usage.total_cache_read_tokens * 0.1,
        );
      const estCost = analytics.token_usage.total_estimated_cost_usd * inputShare;
      const rate = edits > 0 ? estCost / edits : null;
      return { host_tool: m.host_tool, edits, estCost, rate };
    })
    .filter((x) => x.rate != null && x.edits > 0)
    .sort((a, b) => (a.rate ?? Infinity) - (b.rate ?? Infinity));

  const maxRate = Math.max(0.001, ...perTool.map((x) => x.rate ?? 0));

  return (
    <>
      {perTool.length > 0 && (
        <section className={styles.section}>
          <span className={styles.sectionLabel}>By tool · cheapest first</span>
          <div className={styles.breakdownList}>
            {perTool.map((x, i) => {
              const meta = getToolMeta(x.host_tool);
              return (
                <div
                  key={x.host_tool}
                  className={styles.breakdownRow}
                  style={{ '--row-index': i } as CSSProperties}
                >
                  <span className={styles.breakdownLabel}>
                    <ToolIcon tool={x.host_tool} size={14} />
                    {meta.label}
                  </span>
                  <div className={styles.breakdownTrack}>
                    <div
                      className={styles.breakdownFill}
                      style={{
                        width: `${((x.rate ?? 0) / maxRate) * 100}%`,
                        background: meta.color,
                      }}
                    />
                  </div>
                  <span className={styles.breakdownValue}>
                    {fmtUsdFine(x.rate ?? 0)}
                    <span className={styles.breakdownMeta}> / {fmtCount(x.edits)} edits</span>
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className={styles.section}>
        <span className={styles.sectionLabel}>Note</span>
        <span className={styles.empty}>
          Per-tool rates are proportional estimates from input-token share, not model-joined exact
          costs.
        </span>
      </section>
    </>
  );
}

// ── Files-touched tab ────────────────────────────

function FilesTouchedPanel({ analytics }: { analytics: UserAnalytics }) {
  const files = analytics.file_heatmap;
  const dirs = [...analytics.directory_heatmap].sort((a, b) => b.touch_count - a.touch_count);
  const topFiles = [...files].sort((a, b) => b.touch_count - a.touch_count).slice(0, 15);
  const rework = [...analytics.file_rework]
    .filter((r) => r.rework_ratio > 0)
    .sort((a, b) => b.rework_ratio - a.rework_ratio)
    .slice(0, 8);

  const maxDir = Math.max(1, ...dirs.map((d) => d.touch_count));

  if (files.length === 0) {
    return <span className={styles.empty}>No files touched in this window.</span>;
  }

  return (
    <>
      {dirs.length > 0 && (
        <section className={styles.section}>
          <span className={styles.sectionLabel}>By directory</span>
          <div className={styles.breakdownList}>
            {dirs.map((d, i) => (
              <div
                key={d.directory}
                className={styles.breakdownRow}
                style={{ '--row-index': i } as CSSProperties}
              >
                <span className={styles.breakdownLabel}>{d.directory}</span>
                <div className={styles.breakdownTrack}>
                  <div
                    className={styles.breakdownFill}
                    style={{ width: `${(d.touch_count / maxDir) * 100}%` }}
                  />
                </div>
                <span className={styles.breakdownValue}>
                  {fmtCount(d.touch_count)}
                  <span className={styles.breakdownMeta}> · {d.file_count} files</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {topFiles.length > 0 && (
        <section className={styles.section}>
          <span className={styles.sectionLabel}>Most-touched files</span>
          <ul className={styles.fileList}>
            {topFiles.map((f, i) => (
              <li
                key={f.file}
                className={styles.fileRow}
                style={{ '--row-index': i } as CSSProperties}
              >
                <span className={styles.fileName} title={f.file}>
                  {f.file}
                </span>
                <span className={styles.fileMeta}>{fmtCount(f.touch_count)} touches</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {rework.length > 0 && (
        <section className={styles.section}>
          <span className={styles.sectionLabel}>Highest rework ratio</span>
          <ul className={styles.fileList}>
            {rework.map((r, i) => (
              <li
                key={r.file}
                className={styles.fileRow}
                style={{ '--row-index': i } as CSSProperties}
              >
                <span className={styles.fileName} title={r.file}>
                  {r.file}
                </span>
                <span className={styles.fileMeta}>
                  {fmtPct(r.rework_ratio, 1)} rework · {fmtCount(r.total_edits)} edits
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
