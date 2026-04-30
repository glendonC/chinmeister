import {
  FocusedDetailView,
  Metric,
  getCrossLinks,
  type FocusedQuestion,
} from '../../../../components/DetailView/index.js';
import { BreakdownList, BreakdownMeta } from '../../../../components/viz/index.js';
import ToolIcon from '../../../../components/ToolIcon/ToolIcon.js';
import { getToolMeta } from '../../../../lib/toolMeta.js';
import { setQueryParam, useQueryParam } from '../../../../lib/router.js';
import type { UserAnalytics } from '../../../../lib/apiSchemas.js';
import { formatCost } from '../../../../widgets/utils.js';
import { hasCostData } from '../../../../widgets/bodies/shared.js';

import { fmtCount, fmtPct } from '../format.js';
import styles from '../UsageDetailView.module.css';

export function CostPanel({ analytics }: { analytics: UserAnalytics }) {
  const t = analytics.token_usage;
  const costActiveId = useQueryParam('q');
  // Matches the KPI widget's gate, if the total is an em-dash at overview,
  // the detail shouldn't render $0.00. Three reasons fold in: zero token
  // sessions, stale pricing (pricing-enrich zeros total), or every observed
  // model unpriced (totalCost sums to zero for a non-zero reason).
  if (!hasCostData(t)) {
    const reason = t.pricing_is_stale
      ? 'Pricing snapshot is stale, cost estimates paused until it refreshes.'
      : t.by_model.length > 0 && t.models_without_pricing_total >= t.by_model.length
        ? 'None of the models used in this window have pricing yet, cost estimates paused.'
        : 'No tools in this window captured token or cost data yet.';
    return <span className={styles.empty}>{reason}</span>;
  }
  const byModel = [...t.by_model].sort(
    (a, b) => (b.estimated_cost_usd ?? 0) - (a.estimated_cost_usd ?? 0),
  );
  const maxModelCost = Math.max(1, ...byModel.map((m) => m.estimated_cost_usd ?? 0));
  const byTool = [...t.by_tool].sort((a, b) => b.input_tokens - a.input_tokens);
  const maxToolTokens = Math.max(1, ...byTool.map((m) => m.input_tokens + m.cache_read_tokens));
  const totalCost = t.total_estimated_cost_usd ?? 0;

  // Cost-per-edit per tool. Same shape and proportional input-token
  // estimate as the standalone CostPerEdit treatment used to carry; lives
  // here as a sibling question so the dollar story stays in one panel.
  const toolEdits = new Map(analytics.tool_comparison.map((x) => [x.host_tool, x.total_edits]));
  const cpe = t.cost_per_edit;
  const perToolCpe = t.by_tool
    .map((m) => {
      const edits = toolEdits.get(m.host_tool) ?? 0;
      // Rough per-tool cost estimate: proportional input-token share of total
      // cost. Accurate breakdown would need model-joined math; this stays
      // coarse and honest.
      const inputShare =
        (m.input_tokens + m.cache_read_tokens * 0.1) /
        Math.max(1, t.total_input_tokens + t.total_cache_read_tokens * 0.1);
      const estCost = totalCost * inputShare;
      const rate = edits > 0 ? estCost / edits : null;
      return { host_tool: m.host_tool, edits, estCost, rate };
    })
    .filter((x) => x.rate != null && x.edits > 0)
    .sort((a, b) => (a.rate ?? Infinity) - (b.rate ?? Infinity));
  const maxCpeRate = Math.max(0.001, ...perToolCpe.map((x) => x.rate ?? 0));

  // Tones: cache hit rate is positive (higher cache share = lower cost),
  // cost totals stay neutral (dollars in chinmeister's voice are context,
  // not a verdict, we don't tell users their spend is "bad").
  const byModelAnswer = (() => {
    if (byModel.length === 0) return null;
    const top = byModel[0];
    return (
      <>
        <Metric>{top.agent_model}</Metric> accounts for{' '}
        <Metric>{formatCost(top.estimated_cost_usd, 2)}</Metric> of{' '}
        <Metric>{formatCost(totalCost, 2)}</Metric> total.
      </>
    );
  })();

  const byToolAnswer = (() => {
    if (byTool.length === 0) return null;
    const top = byTool[0];
    const topTokens = top.input_tokens + top.cache_read_tokens;
    return (
      <>
        <Metric>{getToolMeta(top.host_tool).label}</Metric> sends the most at{' '}
        <Metric>{fmtCount(Math.round(topTokens / 1000))}k tokens</Metric>.
      </>
    );
  })();

  // Cheapest tool → positive tone (the answer to the question). Most
  // expensive gets warning when it's notably above the cheapest.
  const perEditAnswer = (() => {
    if (perToolCpe.length === 0 || cpe == null) return null;
    const cheapest = perToolCpe[0];
    const priciest = perToolCpe[perToolCpe.length - 1];
    return (
      <>
        <Metric>{getToolMeta(cheapest.host_tool).label}</Metric> edits cheapest at{' '}
        <Metric tone="positive">{formatCost(cheapest.rate, 3)}</Metric> each
        {perToolCpe.length > 1 &&
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
  })();

  const cacheAnswer = (() => {
    if (t.cache_hit_rate == null) return null;
    const tone = t.cache_hit_rate >= 0.5 ? 'positive' : 'neutral';
    const cachedK = Math.round(t.total_cache_read_tokens / 1000);
    const totalK = Math.round((t.total_input_tokens + t.total_cache_read_tokens) / 1000);
    return (
      <>
        <Metric tone={tone}>{fmtPct(t.cache_hit_rate, 1)}</Metric> of input tokens served from
        cache. <Metric>{fmtCount(cachedK)}k</Metric> of <Metric>{fmtCount(totalK)}k</Metric>.
      </>
    );
  })();

  const questions: FocusedQuestion[] = [];
  if (byModel.length > 0 && byModelAnswer) {
    questions.push({
      id: 'by-model',
      question: 'Where is the spend going?',
      answer: byModelAnswer,
      children: (
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
      ),
      relatedLinks: getCrossLinks('usage', 'cost', 'by-model'),
    });
  }
  if (byTool.length > 0 && byToolAnswer) {
    questions.push({
      id: 'by-tool',
      question: 'Which tool sends the most tokens?',
      answer: byToolAnswer,
      children: (
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
      ),
      relatedLinks: getCrossLinks('usage', 'cost', 'by-tool'),
    });
  }
  if (perToolCpe.length > 0 && cpe != null && perEditAnswer) {
    questions.push({
      id: 'per-edit',
      question: 'Which tool gives the best dollar per edit?',
      answer: perEditAnswer,
      children: (
        <>
          <BreakdownList
            items={perToolCpe.map((x) => {
              const meta = getToolMeta(x.host_tool);
              return {
                key: x.host_tool,
                label: (
                  <>
                    <ToolIcon tool={x.host_tool} size={14} />
                    {meta.label}
                  </>
                ),
                fillPct: ((x.rate ?? 0) / maxCpeRate) * 100,
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
    });
  }
  if (t.cache_hit_rate != null && cacheAnswer) {
    questions.push({
      id: 'cache',
      question: 'Is caching pulling its weight?',
      answer: cacheAnswer,
      children: (
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
      ),
    });
  }

  if (questions.length === 0) {
    return <span className={styles.empty}>No cost data available in this window.</span>;
  }

  return (
    <FocusedDetailView
      questions={questions}
      activeId={costActiveId}
      onSelect={(id) => setQueryParam('q', id)}
    />
  );
}
