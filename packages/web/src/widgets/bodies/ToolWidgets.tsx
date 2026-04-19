import { useMemo, type CSSProperties } from 'react';
import SectionEmpty from '../../components/SectionEmpty/SectionEmpty.js';
import { Sparkline } from '../charts.js';
import {
  TOOL_ERROR_RATE_WARN_THRESHOLD,
  aggregateModels,
  formatDuration,
  workTypeColor,
} from '../utils.js';
import { getToolMeta } from '../../lib/toolMeta.js';
import { formatRelativeTime } from '../../lib/relativeTime.js';
import type { TokenUsageStats, UserAnalytics } from '../../lib/apiSchemas.js';
import shared from '../widget-shared.module.css';
import styles from './ToolWidgets.module.css';
import type { WidgetBodyProps, WidgetRegistry } from './types.js';
import { getDataCapabilities } from '@chinwag/shared/tool-registry.js';
import {
  GhostBars,
  GhostRows,
  GhostStatRow,
  StatWidget,
  CoverageNote,
  capabilityCoverageNote,
} from './shared.js';

/**
 * Tool data depth: 3 = full analytics (cost, conversations, tool calls),
 * 2 = activity analytics (edits, outcomes, patterns),
 * 1 = session analytics (sessions, coordination only).
 */
function getToolDepth(toolId: string): { level: 1 | 2 | 3; label: string } {
  const caps = getDataCapabilities(toolId);
  if (caps.conversationLogs || caps.tokenUsage || caps.toolCallLogs) {
    return { level: 3, label: 'Full analytics' };
  }
  if (caps.hooks || caps.commitTracking) {
    return { level: 2, label: 'Activity analytics' };
  }
  return { level: 1, label: 'Session analytics' };
}

function ToolDepthBars({ toolId }: { toolId: string }) {
  const { level, label } = getToolDepth(toolId);
  return (
    <span className={styles.toolDepthBars} title={label}>
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className={styles.depthBar}
          style={{ height: `${i * 4}px`, opacity: i <= level ? 0.8 : 0.15 }}
        />
      ))}
    </span>
  );
}

function ToolsWidget({ analytics }: WidgetBodyProps) {
  const tools = analytics.tool_comparison;
  if (tools.length === 0) {
    return <SectionEmpty>Connect a tool to see comparison</SectionEmpty>;
  }
  return (
    <div className={styles.factualGrid}>
      {tools.map((t) => {
        const meta = getToolMeta(t.host_tool);
        return (
          <div key={t.host_tool} className={styles.factualItem}>
            {meta.icon ? (
              <span className={styles.toolIcon}>
                <img src={meta.icon} alt="" />
              </span>
            ) : (
              <span className={styles.toolIconLetter} style={{ background: meta.color }}>
                {meta.label[0]}
              </span>
            )}
            <div style={{ flex: 1 }}>
              <span className={styles.factualLabel}>{meta.label}</span>
              <div className={styles.factualMeta}>
                <span className={styles.factualMetaValue}>{t.sessions}</span> sessions ·{' '}
                <span className={styles.factualMetaValue}>{t.total_edits.toLocaleString()}</span>{' '}
                edits
                {t.completion_rate > 0 && (
                  <>
                    {' '}
                    · <span className={styles.factualMetaValue}>{t.completion_rate}%</span>
                  </>
                )}
              </div>
            </div>
            <ToolDepthBars toolId={t.host_tool} />
          </div>
        );
      })}
    </div>
  );
}

function ModelsWidget({ analytics }: WidgetBodyProps) {
  return <ModelsList modelOutcomes={analytics.model_outcomes} />;
}

function ModelsList({ modelOutcomes }: { modelOutcomes: UserAnalytics['model_outcomes'] }) {
  const models = useMemo(() => aggregateModels(modelOutcomes), [modelOutcomes]);
  if (models.length === 0) return <GhostRows count={2} />;
  return (
    <div className={shared.dataList}>
      {models.map((m, i) => (
        <div key={m.model} className={shared.dataRow} style={{ '--row-index': i } as CSSProperties}>
          <span className={shared.dataName}>{m.model}</span>
          <div className={shared.dataMeta}>
            <span className={shared.dataStat}>
              <span className={shared.dataStatValue}>{m.total}</span> sessions
            </span>
            <span className={shared.dataStat}>
              <span className={shared.dataStatValue}>{m.edits.toLocaleString()}</span> edits
            </span>
            {(m.linesAdded > 0 || m.linesRemoved > 0) && (
              <span className={shared.dataStat}>
                <span className={shared.dataStatValue}>
                  +{m.linesAdded.toLocaleString()}/-{m.linesRemoved.toLocaleString()}
                </span>
              </span>
            )}
            {m.avgMin > 0 && (
              <span className={shared.dataStat}>
                <span className={shared.dataStatValue}>{m.avgMin.toFixed(1)}m</span> avg
              </span>
            )}
            {m.rate > 0 && (
              <span className={shared.dataStat}>
                <span className={shared.dataStatValue}>{m.rate}%</span>
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function ToolHandoffsWidget({ analytics }: WidgetBodyProps) {
  const th = analytics.tool_handoffs;
  if (th.length === 0) return <SectionEmpty>No cross-tool handoffs</SectionEmpty>;
  return (
    <div className={shared.dataList}>
      {th.slice(0, 10).map((h, i) => (
        <div
          key={`${h.from_tool}-${h.to_tool}`}
          className={shared.dataRow}
          style={{ '--row-index': i } as CSSProperties}
        >
          <span className={shared.dataName}>
            {getToolMeta(h.from_tool).label} → {getToolMeta(h.to_tool).label}
          </span>
          <div className={shared.dataMeta}>
            <span className={shared.dataStat}>
              <span className={shared.dataStatValue}>{h.file_count}</span> files
            </span>
            <span className={shared.dataStat}>
              <span className={shared.dataStatValue}>{h.handoff_completion_rate}%</span> completed
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function ToolCallsWidget({ analytics }: WidgetBodyProps) {
  const tc = analytics.tool_call_stats;
  const tools = analytics.data_coverage?.tools_reporting ?? [];
  const note = capabilityCoverageNote(tools, 'toolCallLogs');
  if (tc.total_calls === 0) {
    return (
      <>
        <GhostStatRow labels={['calls', 'error rate', 'research:edit']} />
        <CoverageNote text={note} />
      </>
    );
  }
  return (
    <>
      <div className={shared.statRow}>
        <div className={shared.statBlock}>
          <span className={shared.statBlockValue}>{tc.total_calls.toLocaleString()}</span>
          <span className={shared.statBlockLabel}>calls</span>
        </div>
        <div className={shared.statBlock}>
          <span className={shared.statBlockValue}>{tc.error_rate}%</span>
          <span className={shared.statBlockLabel}>error rate</span>
        </div>
        <div className={shared.statBlock}>
          <span className={shared.statBlockValue}>{tc.research_to_edit_ratio}:1</span>
          <span className={shared.statBlockLabel}>research:edit</span>
        </div>
        <div className={shared.statBlock}>
          <span className={shared.statBlockValue}>{tc.calls_per_session}</span>
          <span className={shared.statBlockLabel}>calls/session</span>
        </div>
      </div>
      <CoverageNote text={note} />
    </>
  );
}

function ToolCallFreqWidget({ analytics }: WidgetBodyProps) {
  const freq = analytics.tool_call_stats.frequency;
  const tools = analytics.data_coverage?.tools_reporting ?? [];
  const note = capabilityCoverageNote(tools, 'toolCallLogs');
  if (freq.length === 0) {
    return (
      <>
        <GhostBars count={5} />
        <CoverageNote text={note} />
      </>
    );
  }
  const maxC = Math.max(...freq.map((f) => f.calls), 1);
  return (
    <>
      <div className={shared.metricBars}>
        {freq.slice(0, 15).map((f) => (
          <div key={f.tool} className={shared.metricRow}>
            <span className={shared.metricLabel}>{f.tool}</span>
            <div className={shared.metricBarTrack}>
              <div
                className={shared.metricBarFill}
                style={{
                  width: `${(f.calls / maxC) * 100}%`,
                  background:
                    f.error_rate > TOOL_ERROR_RATE_WARN_THRESHOLD ? 'var(--warn)' : undefined,
                }}
              />
            </div>
            <span className={shared.metricValue}>
              {f.calls}
              {f.errors > 0 ? ` · ${f.error_rate}% err` : ''}
              {f.avg_duration_ms > 0 ? ` · ${formatDuration(f.avg_duration_ms)}` : ''}
            </span>
          </div>
        ))}
      </div>
      <CoverageNote text={note} />
    </>
  );
}

function ToolCallErrorsWidget({ analytics }: WidgetBodyProps) {
  const errs = analytics.tool_call_stats.error_patterns;
  const tools = analytics.data_coverage?.tools_reporting ?? [];
  const note = capabilityCoverageNote(tools, 'toolCallLogs');
  if (errs.length === 0) {
    return (
      <>
        <SectionEmpty>No tool errors</SectionEmpty>
        <CoverageNote text={note} />
      </>
    );
  }
  return (
    <>
      <div className={shared.dataList}>
        {errs.slice(0, 10).map((e, i) => (
          <div
            key={`${e.tool}-${i}`}
            className={shared.dataRow}
            style={{ '--row-index': i } as CSSProperties}
          >
            <span className={shared.dataName}>{e.tool}</span>
            <div className={shared.dataMeta}>
              <span className={shared.dataStat} style={{ color: 'var(--danger)' }}>
                <span className={shared.dataStatValue}>{e.count}x</span>
              </span>
              <span
                className={shared.dataStat}
                style={{ opacity: 0.7, fontSize: 'var(--text-2xs)' }}
              >
                {e.error_preview.slice(0, 80)}
              </span>
            </div>
          </div>
        ))}
      </div>
      <CoverageNote text={note} />
    </>
  );
}

function PricingAttribution({ usage }: { usage: TokenUsageStats }) {
  const refreshed = formatRelativeTime(usage.pricing_refreshed_at);
  if (!refreshed) {
    return <div className={shared.coverageNote}>Pricing data unavailable.</div>;
  }
  return (
    <div className={shared.coverageNote}>
      Pricing from{' '}
      <a href="https://github.com/BerriAI/litellm" target="_blank" rel="noopener noreferrer">
        LiteLLM
      </a>
      , refreshed {refreshed}
      {usage.pricing_is_stale && ' — cost estimates disabled until next refresh'}.
    </div>
  );
}

function TokenDetailWidget({ analytics }: WidgetBodyProps) {
  const tu = analytics.token_usage;
  const tools = analytics.data_coverage?.tools_reporting ?? [];
  const note = capabilityCoverageNote(tools, 'tokenUsage');
  if (tu.sessions_with_token_data === 0) {
    return (
      <>
        <GhostRows count={3} />
        <CoverageNote text={note} />
      </>
    );
  }
  return (
    <div className={shared.dataList}>
      {tu.by_model.map((m, i) => (
        <div
          key={m.agent_model}
          className={shared.dataRow}
          style={{ '--row-index': i } as CSSProperties}
        >
          <span className={shared.dataName}>{m.agent_model}</span>
          <div className={shared.dataMeta}>
            <span className={shared.dataStat}>
              <span className={shared.dataStatValue}>{(m.input_tokens / 1000).toFixed(0)}k</span> in
            </span>
            <span className={shared.dataStat}>
              <span className={shared.dataStatValue}>{(m.output_tokens / 1000).toFixed(0)}k</span>{' '}
              out
            </span>
            <span className={shared.dataStat}>
              <span className={shared.dataStatValue}>{m.sessions}</span> sessions
            </span>
            {m.estimated_cost_usd != null && m.estimated_cost_usd > 0 && (
              <span className={shared.dataStat}>
                <span className={shared.dataStatValue}>${m.estimated_cost_usd.toFixed(2)}</span>
              </span>
            )}
          </div>
        </div>
      ))}
      {tu.by_tool.length > 1 && (
        <>
          <span className={styles.sectionSublabel}>By tool</span>
          {tu.by_tool.map((t, i) => (
            <div
              key={t.host_tool}
              className={shared.dataRow}
              style={{ '--row-index': tu.by_model.length + 1 + i } as CSSProperties}
            >
              <span className={shared.dataName}>{getToolMeta(t.host_tool).label}</span>
              <div className={shared.dataMeta}>
                <span className={shared.dataStat}>
                  <span className={shared.dataStatValue}>
                    {(t.input_tokens / 1000).toFixed(0)}k
                  </span>{' '}
                  in
                </span>
                <span className={shared.dataStat}>
                  <span className={shared.dataStatValue}>
                    {(t.output_tokens / 1000).toFixed(0)}k
                  </span>{' '}
                  out
                </span>
                <span className={shared.dataStat}>
                  <span className={shared.dataStatValue}>{t.sessions}</span> sessions
                </span>
              </div>
            </div>
          ))}
        </>
      )}
      <PricingAttribution usage={tu} />
    </div>
  );
}

function ToolDailyWidget({ analytics }: WidgetBodyProps) {
  const td = analytics.tool_daily;
  if (td.length === 0) return <GhostBars count={3} />;
  const byTool = new Map<string, { sessions: number; series: Map<string, number> }>();
  for (const d of td) {
    const e = byTool.get(d.host_tool) ?? { sessions: 0, series: new Map<string, number>() };
    e.sessions += d.sessions;
    e.series.set(d.day, (e.series.get(d.day) ?? 0) + d.sessions);
    byTool.set(d.host_tool, e);
  }
  const tools = [...byTool.entries()]
    .map(([tool, v]) => ({
      tool,
      sessions: v.sessions,
      data: [...v.series.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, n]) => n),
    }))
    .filter((t) => t.sessions > 0)
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 5);
  if (tools.length === 0) return <GhostBars count={3} />;
  return (
    <div className={shared.metricBars}>
      {tools.map((t) => {
        const meta = getToolMeta(t.tool);
        return (
          <div key={t.tool} className={shared.metricRow}>
            <span className={shared.metricLabel} title={meta.label}>
              {meta.label}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              {t.data.length >= 2 ? (
                <Sparkline data={t.data} height={32} color={meta.color} />
              ) : (
                <span style={{ opacity: 0.4, fontSize: 'var(--text-2xs)' }}>—</span>
              )}
            </div>
            <span className={shared.metricValue}>{t.sessions}</span>
          </div>
        );
      })}
    </div>
  );
}

function ToolWorkTypeWidget({ analytics }: WidgetBodyProps) {
  const twt = analytics.tool_work_type;
  if (twt.length === 0) return <GhostBars count={3} />;
  const byTool = new Map<string, { sessions: number; types: Map<string, number> }>();
  for (const t of twt) {
    const e = byTool.get(t.host_tool) ?? { sessions: 0, types: new Map<string, number>() };
    e.sessions += t.sessions;
    e.types.set(t.work_type, (e.types.get(t.work_type) ?? 0) + t.sessions);
    byTool.set(t.host_tool, e);
  }
  const tools = [...byTool.entries()]
    .map(([tool, v]) => ({
      tool,
      sessions: v.sessions,
      types: [...v.types.entries()].map(([work_type, sessions]) => ({ work_type, sessions })),
    }))
    .filter((t) => t.sessions > 0)
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 5);
  if (tools.length === 0) return <GhostBars count={3} />;
  const allTypes = new Map<string, number>();
  for (const t of tools) {
    for (const w of t.types) {
      allTypes.set(w.work_type, (allTypes.get(w.work_type) ?? 0) + w.sessions);
    }
  }
  const orderedTypes = [...allTypes.entries()].sort((a, b) => b[1] - a[1]).map(([w]) => w);
  return (
    <div>
      <div className={shared.metricBars} style={{ marginBottom: 12 }}>
        {tools.map((t) => {
          const meta = getToolMeta(t.tool);
          return (
            <div key={t.tool} className={shared.metricRow}>
              <span className={shared.metricLabel} title={meta.label}>
                {meta.label}
              </span>
              <div className={shared.workBar} style={{ flex: 1, marginBottom: 0 }}>
                {orderedTypes.map((wt) => {
                  const w = t.types.find((x) => x.work_type === wt);
                  const pct = w ? (w.sessions / t.sessions) * 100 : 0;
                  if (pct < 0.5) return null;
                  return (
                    <div
                      key={wt}
                      className={shared.workSegment}
                      style={{
                        width: `${pct}%`,
                        background: workTypeColor(wt),
                      }}
                      title={`${wt}: ${Math.round(pct)}%`}
                    />
                  );
                })}
              </div>
              <span className={shared.metricValue}>{t.sessions}</span>
            </div>
          );
        })}
      </div>
      <div className={shared.workLegend}>
        {orderedTypes.slice(0, 6).map((wt) => (
          <div key={wt} className={shared.workLegendItem}>
            <span className={shared.workDot} style={{ background: workTypeColor(wt) }} />
            <span className={shared.workLegendLabel}>{wt}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CacheEfficiencyWidget({ analytics }: WidgetBodyProps) {
  const chr = analytics.token_usage.cache_hit_rate;
  const tools = analytics.data_coverage?.tools_reporting ?? [];
  const note = capabilityCoverageNote(tools, 'tokenUsage');
  const value = chr == null ? '--' : `${Math.round(chr * 100)}%`;
  return (
    <>
      <StatWidget value={value} />
      <CoverageNote text={note} />
    </>
  );
}

export const toolWidgets: WidgetRegistry = {
  tools: ToolsWidget,
  models: ModelsWidget,
  'tool-handoffs': ToolHandoffsWidget,
  'tool-calls': ToolCallsWidget,
  'tool-call-freq': ToolCallFreqWidget,
  'tool-call-errors': ToolCallErrorsWidget,
  'token-detail': TokenDetailWidget,
  'tool-daily': ToolDailyWidget,
  'tool-work-type': ToolWorkTypeWidget,
  'cache-efficiency': CacheEfficiencyWidget,
};
