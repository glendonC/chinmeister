import { useMemo, useState, type CSSProperties } from 'react';

import {
  FocusedDetailView,
  Metric,
  getCrossLinks,
  type FocusedQuestion,
} from '../../../../components/DetailView/index.js';
import { setQueryParam, useQueryParam } from '../../../../lib/router.js';
import { getToolMeta } from '../../../../lib/toolMeta.js';
import { formatRelativeTime } from '../../../../lib/relativeTime.js';
import {
  CoverageNote,
  capabilityCoverageNote,
  GhostRows,
} from '../../../../widgets/bodies/shared.js';
import type { UserAnalytics } from '../../../../lib/apiSchemas.js';
import shared from '../../../../widgets/widget-shared.module.css';

import { fmtCount } from '../format.js';
import styles from '../ToolsDetailView.module.css';

export function ErrorsPanel({
  analytics,
  callStats,
}: {
  analytics: UserAnalytics;
  callStats: UserAnalytics['tool_call_stats'];
}) {
  const activeId = useQueryParam('q');
  const errs = callStats.error_patterns;
  const reporting = analytics.data_coverage?.tools_reporting ?? [];
  const toolCallNote = capabilityCoverageNote(reporting, 'toolCallLogs');
  const tokenNote = capabilityCoverageNote(reporting, 'tokenUsage');
  const tu = analytics.token_usage;

  // Q1 top: group errors by tool, render one section per tool sorted by
  // section error count desc. Per-tool brand-color section header.
  // Each row: count x pill, error preview, last-seen relative time. This
  // is the cross-tool error TOPOLOGY surface, the spec is explicit that
  // this belongs here, not in Outcomes.
  const errorsByTool = useMemo(() => {
    const map = new Map<string, typeof errs>();
    for (const e of errs) {
      const list = map.get(e.tool) ?? [];
      list.push(e);
      map.set(e.tool, list);
    }
    const out = [...map.entries()].map(([tool, list]) => ({
      tool,
      total: list.reduce((s, x) => s + x.count, 0),
      patterns: [...list].sort((a, b) => b.count - a.count),
    }));
    return out.sort((a, b) => b.total - a.total);
  }, [errs]);

  const distinct = errs.length;
  const topErr = useMemo(
    () => (errs.length === 0 ? null : [...errs].sort((a, b) => b.count - a.count)[0]),
    [errs],
  );
  const toolCount = errorsByTool.length;

  const topAnswer = topErr ? (
    <>
      <Metric tone="negative">{topErr.count}×</Metric> <Metric>{topErr.tool}</Metric> errors,
      &lsquo;<em>{topErr.error_preview.slice(0, 80)}</em>&rsquo;.{' '}
      <Metric>{fmtCount(distinct)}</Metric> distinct error patterns across{' '}
      <Metric>{fmtCount(toolCount)}</Metric> tools.
    </>
  ) : null;

  // Q2 recent: most recent 8 errors, newest at top, oldest bottom.
  // Relative-time chip + brand-colored tool pill + preview. nowMs
  // captured once at mount via useState lazy init (the same pattern
  // MemoryWidgets uses) so re-renders stay pure, no Date.now in render.
  const [nowMs] = useState(() => Date.now());
  const recentList = useMemo(
    () =>
      [...errs]
        .filter((e) => e.last_at != null)
        .sort((a, b) => (a.last_at! < b.last_at! ? 1 : -1))
        .slice(0, 8),
    [errs],
  );
  const recent24hCount = useMemo(
    () =>
      errs
        .filter((e) => {
          if (!e.last_at) return false;
          return nowMs - new Date(e.last_at).getTime() < 24 * 60 * 60 * 1000;
        })
        .reduce((s, e) => s + e.count, 0),
    [errs, nowMs],
  );
  const lastSeen = recentList[0]?.last_at ?? null;
  const recentAnswer =
    recent24hCount > 0 ? (
      <>
        <Metric>{fmtCount(recent24hCount)}</Metric> errors in the last 24h
        {lastSeen && (
          <>
            , last seen <Metric>{formatRelativeTime(lastSeen)}</Metric> ago
          </>
        )}
        .
      </>
    ) : null;

  // Q3 tokens: lifted directly from TokenDetailWidget body.
  const topModelByCost = useMemo(() => {
    if (tu.by_model.length === 0) return null;
    return [...tu.by_model].sort(
      (a, b) => (b.estimated_cost_usd ?? 0) - (a.estimated_cost_usd ?? 0),
    )[0];
  }, [tu.by_model]);
  const tokenAnswer =
    tu.sessions_with_token_data > 0 && topModelByCost ? (
      <>
        <Metric>{fmtCount(tu.by_model.length)}</Metric> models across{' '}
        <Metric>{fmtCount(tu.by_tool.length)}</Metric> tools. Highest spend:{' '}
        <Metric>{topModelByCost.agent_model}</Metric> at{' '}
        <Metric>
          {topModelByCost.estimated_cost_usd != null && topModelByCost.estimated_cost_usd > 0
            ? `$${topModelByCost.estimated_cost_usd.toFixed(2)}`
            : '—'}
        </Metric>
        .
      </>
    ) : null;

  const questions: FocusedQuestion[] = [];

  if (errs.length === 0) {
    questions.push({
      id: 'top',
      question: 'Which errors are recurring?',
      answer: <>No tool-call errors in this window.</>,
      children: (
        <>
          <span className={styles.empty}>No tool errors</span>
          <CoverageNote text={toolCallNote} />
        </>
      ),
      relatedLinks: getCrossLinks('tools', 'errors', 'top'),
    });
  } else {
    questions.push({
      id: 'top',
      question: 'Which errors are recurring?',
      answer: topAnswer,
      children: (
        <>
          {errorsByTool.map((group) => {
            const meta = getToolMeta(group.tool);
            return (
              <div key={group.tool} className={styles.toolGroup}>
                <div className={styles.toolGroupHead}>
                  <span className={styles.toolGroupDot} style={{ background: meta.color }} />
                  <span>{meta.label}</span>
                  <span className={styles.toolGroupCount}>
                    {fmtCount(group.total)} errors · {group.patterns.length} patterns
                  </span>
                </div>
                <div className={shared.dataList}>
                  {group.patterns.map((e, i) => (
                    <div
                      key={`${group.tool}-${i}-${e.error_preview.slice(0, 16)}`}
                      className={shared.dataRow}
                      style={{ '--row-index': i } as CSSProperties}
                    >
                      <span className={styles.errCountPill}>{e.count}×</span>
                      <span className={styles.errPreview} title={e.error_preview}>
                        {e.error_preview.slice(0, 120)}
                      </span>
                      {e.last_at && (
                        <span className={styles.errLast}>{formatRelativeTime(e.last_at)}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          <CoverageNote text={toolCallNote} />
        </>
      ),
      relatedLinks: getCrossLinks('tools', 'errors', 'top'),
    });
  }

  if (recentList.length > 0 && recentAnswer) {
    questions.push({
      id: 'recent',
      question: "What's broken right now?",
      answer: recentAnswer,
      children: (
        <div className={styles.timeline}>
          {recentList.map((e, i) => {
            const meta = getToolMeta(e.tool);
            return (
              <div
                key={`${e.tool}-${i}-${e.error_preview.slice(0, 16)}`}
                className={styles.timelineRow}
                style={{ '--row-index': i } as CSSProperties}
              >
                <span className={styles.timelineChip}>
                  {e.last_at ? formatRelativeTime(e.last_at) : '—'}
                </span>
                <span className={styles.timelineToolPill}>
                  <span className={styles.timelineToolDot} style={{ background: meta.color }} />
                  {meta.label}
                </span>
                <span className={styles.timelinePreview} title={e.error_preview}>
                  {e.error_preview.slice(0, 120)}
                </span>
              </div>
            );
          })}
        </div>
      ),
    });
  } else {
    questions.push({
      id: 'recent',
      question: "What's broken right now?",
      answer: <>No tool-call errors in the last 24h.</>,
      children: <span className={styles.empty}>No tool-call errors in the last 24h.</span>,
    });
  }

  if (tu.sessions_with_token_data > 0 && tokenAnswer) {
    questions.push({
      id: 'tokens',
      question: 'What is each model+tool combo costing?',
      answer: tokenAnswer,
      children: <TokenDetailBlock analytics={analytics} note={tokenNote} />,
      relatedLinks: getCrossLinks('tools', 'errors', 'tokens'),
    });
  } else {
    questions.push({
      id: 'tokens',
      question: 'What is each model+tool combo costing?',
      answer: <>Token and cost data appears as tools with token logs run sessions.</>,
      children: (
        <>
          <GhostRows count={3} />
          <CoverageNote text={tokenNote} />
        </>
      ),
      relatedLinks: getCrossLinks('tools', 'errors', 'tokens'),
    });
  }

  return (
    <div className={styles.panel}>
      <FocusedDetailView
        questions={questions}
        activeId={activeId}
        onSelect={(id) => setQueryParam('q', id)}
      />
    </div>
  );
}

// Token detail block. Lifted from TokenDetailWidget body. By-model rows
// on top, by-tool rows below with section header, then PricingAttribution
// footer. The widget itself stays as-is for the catalog; this is the
// detail view's deep-dive surface.
function TokenDetailBlock({ analytics, note }: { analytics: UserAnalytics; note: string | null }) {
  const tu = analytics.token_usage;
  const refreshed = formatRelativeTime(tu.pricing_refreshed_at);

  return (
    <div className={styles.tokenList}>
      {tu.by_model.map((m, i) => (
        <div
          key={m.agent_model}
          className={styles.tokenRow}
          style={{ '--row-index': i } as CSSProperties}
        >
          <span className={styles.tokenName}>{m.agent_model}</span>
          <div className={styles.tokenMeta}>
            <span className={styles.tokenStat}>
              <span className={styles.tokenStatValue}>{(m.input_tokens / 1000).toFixed(0)}k</span>{' '}
              in
            </span>
            <span className={styles.tokenStat}>
              <span className={styles.tokenStatValue}>{(m.output_tokens / 1000).toFixed(0)}k</span>{' '}
              out
            </span>
            <span className={styles.tokenStat}>
              <span className={styles.tokenStatValue}>{fmtCount(m.sessions)}</span> sessions
            </span>
            <span className={styles.tokenStat}>
              <span className={styles.tokenStatValue}>
                {m.estimated_cost_usd != null && m.estimated_cost_usd > 0
                  ? `$${m.estimated_cost_usd.toFixed(2)}`
                  : '—'}
              </span>
            </span>
          </div>
        </div>
      ))}
      {tu.by_tool.length > 1 && (
        <>
          <div className={styles.tokenSectionHead}>By tool</div>
          {tu.by_tool.map((t, i) => (
            <div
              key={t.host_tool}
              className={styles.tokenRow}
              style={{ '--row-index': tu.by_model.length + 1 + i } as CSSProperties}
            >
              <span className={styles.tokenName}>{getToolMeta(t.host_tool).label}</span>
              <div className={styles.tokenMeta}>
                <span className={styles.tokenStat}>
                  <span className={styles.tokenStatValue}>
                    {(t.input_tokens / 1000).toFixed(0)}k
                  </span>{' '}
                  in
                </span>
                <span className={styles.tokenStat}>
                  <span className={styles.tokenStatValue}>
                    {(t.output_tokens / 1000).toFixed(0)}k
                  </span>{' '}
                  out
                </span>
                <span className={styles.tokenStat}>
                  <span className={styles.tokenStatValue}>{fmtCount(t.sessions)}</span> sessions
                </span>
              </div>
            </div>
          ))}
        </>
      )}
      {refreshed ? (
        <div className={styles.tokenFooter}>
          Pricing from{' '}
          <a href="https://github.com/BerriAI/litellm" target="_blank" rel="noopener noreferrer">
            LiteLLM
          </a>
          , refreshed {refreshed}
          {tu.pricing_is_stale && ', cost estimates disabled until next refresh'}.
        </div>
      ) : (
        <div className={styles.tokenFooter}>Pricing data unavailable.</div>
      )}
      <CoverageNote text={note} />
    </div>
  );
}
