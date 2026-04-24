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
import { fmtCount } from './shared.js';
import styles from './UsageDetailView.module.css';

export default function CostPerEditPanel({ analytics }: { analytics: UserAnalytics }) {
  const t = analytics.token_usage;
  const cpe = t.cost_per_edit;
  const byTool = t.by_tool;
  const toolCompare = new Map(analytics.tool_comparison.map((x) => [x.host_tool, x.total_edits]));

  // Lock-step with the KPI: cost-per-edit inherits the cost total's
  // reliability gate (stale pricing, all-unpriced) plus its own null case.
  // Pricing-specific reasons pre-empt the default empty copy so the user
  // knows why the em-dash is there, not just that it is.
  if (!hasCostData(t) || cpe == null) {
    const reason = t.pricing_is_stale
      ? 'Pricing snapshot is stale — cost estimates paused until it refreshes.'
      : t.by_model.length > 0 && t.models_without_pricing_total >= t.by_model.length
        ? 'None of the models used in this window have pricing yet — cost estimates paused.'
        : 'Cost per edit needs sessions with both token and edit data — none recorded yet.';
    return <span className={styles.empty}>{reason}</span>;
  }

  const perTool = byTool
    .map((m) => {
      const edits = toolCompare.get(m.host_tool) ?? 0;
      // Rough per-tool cost estimate: proportional input-token share of total
      // cost. Accurate breakdown would need model-joined math; this stays
      // coarse and honest.
      const inputShare =
        (m.input_tokens + m.cache_read_tokens * 0.1) /
        Math.max(1, t.total_input_tokens + t.total_cache_read_tokens * 0.1);
      const estCost = t.total_estimated_cost_usd * inputShare;
      const rate = edits > 0 ? estCost / edits : null;
      return { host_tool: m.host_tool, edits, estCost, rate };
    })
    .filter((x) => x.rate != null && x.edits > 0)
    .sort((a, b) => (a.rate ?? Infinity) - (b.rate ?? Infinity));

  const maxRate = Math.max(0.001, ...perTool.map((x) => x.rate ?? 0));

  return (
    <>
      {perTool.length > 0 && (
        <DetailSection label="By tool · cheapest first">
          <BreakdownList
            items={perTool.map((x) => {
              const meta = getToolMeta(x.host_tool);
              return {
                key: x.host_tool,
                label: (
                  <>
                    <ToolIcon tool={x.host_tool} size={14} />
                    {meta.label}
                  </>
                ),
                fillPct: ((x.rate ?? 0) / maxRate) * 100,
                fillColor: meta.color,
                value: (
                  <>
                    {formatCost(x.rate, 3)}
                    <BreakdownMeta> / {fmtCount(x.edits)} edits</BreakdownMeta>
                  </>
                ),
              };
            })}
          />
        </DetailSection>
      )}

      <DetailSection label="Note">
        <span className={styles.empty}>
          Per-tool rates are proportional estimates from input-token share, not model-joined exact
          costs.
        </span>
      </DetailSection>
    </>
  );
}
