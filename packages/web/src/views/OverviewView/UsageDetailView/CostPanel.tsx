import {
  BreakdownList,
  BreakdownMeta,
  DetailSection,
} from '../../../components/DetailView/index.js';
import ToolIcon from '../../../components/ToolIcon/ToolIcon.js';
import { getToolMeta } from '../../../lib/toolMeta.js';
import type { UserAnalytics } from '../../../lib/apiSchemas.js';
import { formatCost } from '../../../widgets/utils.js';
import { hasCostData } from '../../../widgets/bodies/shared.js';
import { fmtCount, fmtPct } from './shared.js';
import styles from './UsageDetailView.module.css';

export default function CostPanel({ analytics }: { analytics: UserAnalytics }) {
  const t = analytics.token_usage;
  // Matches the KPI widget's gate — if the total is an em-dash at overview,
  // the detail shouldn't render $0.00. Three reasons fold in: zero token
  // sessions, stale pricing (pricing-enrich zeros total), or every observed
  // model unpriced (totalCost sums to zero for a non-zero reason).
  if (!hasCostData(t)) {
    const reason = t.pricing_is_stale
      ? 'Pricing snapshot is stale — cost estimates paused until it refreshes.'
      : t.by_model.length > 0 && t.models_without_pricing_total >= t.by_model.length
        ? 'None of the models used in this window have pricing yet — cost estimates paused.'
        : 'No tools in this window captured token or cost data yet.';
    return <span className={styles.empty}>{reason}</span>;
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
        <DetailSection label="By model">
          <BreakdownList
            items={byModel.map((m) => ({
              key: m.agent_model,
              label: m.agent_model,
              fillPct: ((m.estimated_cost_usd ?? 0) / maxModelCost) * 100,
              value: (
                <>
                  {formatCost(m.estimated_cost_usd, 2)}
                  <BreakdownMeta> · {fmtCount(m.sessions)} sessions</BreakdownMeta>
                </>
              ),
            }))}
          />
        </DetailSection>
      )}

      {byTool.length > 0 && (
        <DetailSection label="By tool (input + cache read)">
          <BreakdownList
            items={byTool.map((m) => {
              const meta = getToolMeta(m.host_tool);
              const tokens = m.input_tokens + m.cache_read_tokens;
              return {
                key: m.host_tool,
                label: (
                  <>
                    <ToolIcon tool={m.host_tool} size={14} />
                    {meta.label}
                  </>
                ),
                fillPct: (tokens / maxToolTokens) * 100,
                fillColor: meta.color,
                value: `${fmtCount(Math.round(tokens / 1000))}k tok`,
              };
            })}
          />
        </DetailSection>
      )}

      {t.cache_hit_rate != null && (
        <DetailSection label="Cache efficiency">
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
        </DetailSection>
      )}
    </>
  );
}
