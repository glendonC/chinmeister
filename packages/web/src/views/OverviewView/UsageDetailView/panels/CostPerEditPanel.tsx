import {
  FocusedDetailView,
  Metric,
  type FocusedQuestion,
} from '../../../../components/DetailView/index.js';
import { BreakdownList, BreakdownMeta } from '../../../../components/viz/index.js';
import ToolIcon from '../../../../components/ToolIcon/ToolIcon.js';
import { getToolMeta } from '../../../../lib/toolMeta.js';
import { setQueryParam, useQueryParam } from '../../../../lib/router.js';
import type { UserAnalytics } from '../../../../lib/apiSchemas.js';
import { formatCost } from '../../../../widgets/utils.js';
import { hasCostData } from '../../../../widgets/bodies/shared.js';

import { fmtCount } from '../format.js';
import styles from '../UsageDetailView.module.css';

export function CostPerEditPanel({ analytics }: { analytics: UserAnalytics }) {
  const t = analytics.token_usage;
  const cpe = t.cost_per_edit;
  const byTool = t.by_tool;
  const toolCompare = new Map(analytics.tool_comparison.map((x) => [x.host_tool, x.total_edits]));
  const cpeActiveId = useQueryParam('q');

  // Lock-step with the KPI: cost-per-edit inherits the cost total's
  // reliability gate (stale pricing, all-unpriced) plus its own null case.
  // Pricing-specific reasons pre-empt the default empty copy so the user
  // knows why the em-dash is there, not just that it is.
  if (!hasCostData(t) || cpe == null) {
    const reason = t.pricing_is_stale
      ? 'Pricing snapshot is stale, cost estimates paused until it refreshes.'
      : t.by_model.length > 0 && t.models_without_pricing_total >= t.by_model.length
        ? 'None of the models used in this window have pricing yet, cost estimates paused.'
        : 'Cost per edit needs sessions with both token and edit data, none recorded yet.';
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
      // The hasCostData gate above guarantees total_estimated_cost_usd is a
      // number, but the contract types it as nullable so the gate is invisible
      // to TS. The nullish coalescing here is a no-op at runtime past that
      // gate; it's load-bearing only for the type.
      const estCost = (t.total_estimated_cost_usd ?? 0) * inputShare;
      const rate = edits > 0 ? estCost / edits : null;
      return { host_tool: m.host_tool, edits, estCost, rate };
    })
    .filter((x) => x.rate != null && x.edits > 0)
    .sort((a, b) => (a.rate ?? Infinity) - (b.rate ?? Infinity));

  const maxRate = Math.max(0.001, ...perTool.map((x) => x.rate ?? 0));

  if (perTool.length === 0) {
    return <span className={styles.empty}>No per-tool cost data available in this window.</span>;
  }

  // Cheapest tool → positive tone (the answer to the question). Most
  // expensive gets warning when it's notably above the cheapest.
  const cheapest = perTool[0];
  const priciest = perTool[perTool.length - 1];
  const cheapestAnswer = (
    <>
      <Metric>{getToolMeta(cheapest.host_tool).label}</Metric> edits cheapest at{' '}
      <Metric tone="positive">{formatCost(cheapest.rate, 3)}</Metric> each
      {perTool.length > 1 &&
      priciest.rate &&
      cheapest.rate &&
      priciest.rate > cheapest.rate * 1.2 ? (
        <>
          , vs <Metric>{getToolMeta(priciest.host_tool).label}</Metric> at{' '}
          <Metric tone="warning">{formatCost(priciest.rate, 3)}</Metric>.
        </>
      ) : (
        '.'
      )}
    </>
  );

  const questions: FocusedQuestion[] = [
    {
      id: 'by-tool-cost',
      question: 'Which tool gives the best dollar per edit?',
      answer: cheapestAnswer,
      children: (
        <>
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
          <p className={styles.cpeCaveat}>
            Per-tool rates are proportional estimates from input-token share, not model-joined exact
            costs.
          </p>
        </>
      ),
    },
  ];

  return (
    <FocusedDetailView
      questions={questions}
      activeId={cpeActiveId}
      onSelect={(id) => setQueryParam('q', id)}
    />
  );
}
