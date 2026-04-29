import { useMemo, type CSSProperties } from 'react';

import {
  FocusedDetailView,
  Metric,
  getCrossLinks,
  type FocusedQuestion,
} from '../../../../components/DetailView/index.js';
import {
  BreakdownList,
  BreakdownMeta,
  ToolCoverageMatrix,
  type ToolCoverageEntry,
} from '../../../../components/viz/index.js';
import { setQueryParam, useQueryParam } from '../../../../lib/router.js';
import { getToolMeta } from '../../../../lib/toolMeta.js';
import { aggregateModels } from '../../../../widgets/utils.js';
import {
  CoverageNote,
  capabilityCoverageNote,
  GhostRows,
} from '../../../../widgets/bodies/shared.js';
import { MIN_TOOL_SAMPLE } from '../../../../widgets/bodies/ToolWidgets.js';
import { getDataCapabilities } from '@chinmeister/shared/tool-registry.js';
import type { UserAnalytics } from '../../../../lib/apiSchemas.js';

import { fmtCount, completionTone } from '../format.js';
import styles from '../ToolsDetailView.module.css';

export function ToolsPanel({ analytics }: { analytics: UserAnalytics }) {
  const activeId = useQueryParam('q');
  const tools = analytics.tool_comparison;
  const reporting = analytics.data_coverage?.tools_reporting ?? [];
  const tokenNote = capabilityCoverageNote(reporting, 'tokenUsage');

  // Q1 coverage: tools x capabilities affordance grid.
  // Capabilities sourced from the shared registry's DataCapabilities so
  // the matrix stays in sync with what each parser actually exposes.
  // All hooks must run before any early returns; React's rules-of-hooks
  // requires consistent call order regardless of branch.
  const coverageEntries: ToolCoverageEntry[] = useMemo(
    () =>
      tools.map((t) => {
        const meta = getToolMeta(t.host_tool);
        const caps = getDataCapabilities(t.host_tool);
        return {
          id: t.host_tool,
          label: meta.label,
          color: meta.color,
          capabilities: {
            conversationLogs: caps.conversationLogs === true,
            tokenUsage: caps.tokenUsage === true,
            toolCallLogs: caps.toolCallLogs === true,
            hooks: caps.hooks === true,
            commitTracking: caps.commitTracking === true,
          },
        };
      }),
    [tools],
  );

  const modelRows = useMemo(
    () => aggregateModels(analytics.model_outcomes),
    [analytics.model_outcomes],
  );

  const modelToolCount = useMemo(() => {
    const set = new Set<string>();
    for (const m of modelRows) {
      for (const t of m.byTool) set.add(t.host_tool);
    }
    return set.size;
  }, [modelRows]);

  const workTypeRows = analytics.tool_work_type;
  const workTypeByType = useMemo(() => {
    const map = new Map<string, typeof workTypeRows>();
    for (const row of workTypeRows) {
      const list = map.get(row.work_type) ?? [];
      list.push(row);
      map.set(row.work_type, list);
    }
    return [...map.entries()]
      .map(([work_type, rows]) => ({
        work_type,
        rows: [...rows].sort((a, b) => b.sessions - a.sessions),
        totalSessions: rows.reduce((s, r) => s + r.sessions, 0),
      }))
      .sort((a, b) => b.totalSessions - a.totalSessions);
  }, [workTypeRows]);

  const bestFitByType = useMemo(() => {
    return workTypeByType
      .map((g) => {
        const eligible = g.rows.filter((r) => r.sessions >= MIN_TOOL_SAMPLE);
        const winner =
          eligible.length === 0
            ? null
            : [...eligible].sort((a, b) => b.completion_rate - a.completion_rate)[0];
        return { work_type: g.work_type, totalSessions: g.totalSessions, winner };
      })
      .filter((g) => g.totalSessions > 0);
  }, [workTypeByType]);

  const oneShot = analytics.tool_call_stats.host_one_shot;
  const sortedOneShot = useMemo(
    () => [...oneShot].filter((r) => r.sessions > 0).sort((a, b) => b.sessions - a.sessions),
    [oneShot],
  );

  if (tools.length === 0) {
    return (
      <div className={styles.panel}>
        <span className={styles.empty}>
          Connect a tool with `chinmeister add &lt;tool&gt;` to populate.
        </span>
      </div>
    );
  }

  const deepCount = coverageEntries.filter((e) => e.capabilities.hooks === true).length;
  const mcpOnly = coverageEntries.length - deepCount;

  const coverageAnswer = (
    <>
      <Metric>{fmtCount(coverageEntries.length)}</Metric> tools reported activity.{' '}
      {deepCount > 0 && (
        <>
          <Metric tone="positive">{fmtCount(deepCount)}</Metric> sent hooks
          {mcpOnly > 0 ? '; ' : '.'}
        </>
      )}
      {mcpOnly > 0 && (
        <>
          <Metric tone="warning">{fmtCount(mcpOnly)}</Metric> {mcpOnly === 1 ? 'is' : 'are'}{' '}
          MCP-only (presence + claims, no edits).
        </>
      )}
    </>
  );

  // Q2 workload: per-tool sessions+edits with completion as a muted
  // contextual stat, not a sortable rank. Spec guardrail: lead with
  // sessions, color the bar with the brand, surface completion as dim text.
  const totalSessions = tools.reduce((s, t) => s + t.sessions, 0);
  const sortedByEdits = [...tools].sort((a, b) => b.total_edits - a.total_edits);
  const topTool = sortedByEdits[0];
  const topShare =
    topTool && totalSessions > 0 ? Math.round((topTool.sessions / totalSessions) * 100) : 0;
  const maxEdits = Math.max(...tools.map((t) => t.total_edits), 1);

  const workloadAnswer = topTool ? (
    <>
      <Metric>{getToolMeta(topTool.host_tool).label}</Metric> ran{' '}
      <Metric>{fmtCount(topTool.sessions)}</Metric> sessions and{' '}
      <Metric>{fmtCount(topTool.total_edits)}</Metric> edits, about <Metric>{topShare}%</Metric> of
      activity.
    </>
  ) : null;

  // Q3 models: per-model rows with per-tool attribution pills.
  // Lifted directly from ModelsList in ToolWidgets.tsx, the brand-color
  // pill is the spec mitigation that justifies this question.
  const topModel = modelRows[0];
  const topModelShare =
    topModel && modelRows.length > 0
      ? Math.round((topModel.total / modelRows.reduce((s, m) => s + m.total, 0)) * 100)
      : 0;

  const modelsAnswer = topModel ? (
    <>
      <Metric>{fmtCount(modelRows.length)}</Metric> models observed across{' '}
      <Metric>{fmtCount(modelToolCount)}</Metric> tools. <Metric>{topModel.model}</Metric> has the
      most sessions (<Metric>{topModelShare}%</Metric>); model attribution requires tool-call or
      token logs.
    </>
  ) : null;

  // Q4 work-type: per-work-type, which tool fits best (highest completion
  // at sample sufficient to mean something). Keyed off the backend's
  // tool_work_type with completion_rate already attached.
  const fittedCount = bestFitByType.filter((g) => g.winner !== null).length;
  const workTypeAnswer =
    bestFitByType.length > 0 ? (
      <>
        <Metric>{fmtCount(fittedCount)}</Metric> of{' '}
        <Metric>{fmtCount(bestFitByType.length)}</Metric> work-types have a tool with enough
        sessions to call a fit. Cells below carry per-tool completion at sample.
      </>
    ) : null;

  // Q5 one-shot: per-tool first-try rate from host_one_shot. First-try is
  // a session that produced edits without an Edit-Bash-Edit retry loop.
  // The metric makes sense only when the tool is the one doing edits, so
  // we filter to tools that show up in tool_comparison with sessions > 0.
  const oneShotEligible = sortedOneShot.filter((r) => r.sessions >= MIN_TOOL_SAMPLE);
  const oneShotLeader =
    oneShotEligible.length === 0
      ? null
      : [...oneShotEligible].sort((a, b) => b.one_shot_rate - a.one_shot_rate)[0];
  const maxOneShotSessions = Math.max(...sortedOneShot.map((r) => r.sessions), 1);

  const oneShotAnswer = oneShotLeader ? (
    <>
      <Metric>{getToolMeta(oneShotLeader.host_tool).label}</Metric> lands edits first try{' '}
      <Metric tone={completionTone(oneShotLeader.one_shot_rate)}>
        {oneShotLeader.one_shot_rate}%
      </Metric>{' '}
      of the time across <Metric>{fmtCount(oneShotLeader.sessions)}</Metric> sessions. Below sample
      threshold ({MIN_TOOL_SAMPLE}) shows em-dash.
    </>
  ) : null;

  const questions: FocusedQuestion[] = [
    {
      id: 'capability',
      question: 'Which tools are reporting, and how deeply?',
      answer: coverageAnswer,
      children: <ToolCoverageMatrix tools={coverageEntries} />,
    },
    {
      id: 'workload',
      question: 'Where is the work landing?',
      answer: workloadAnswer ?? <>No tools have recorded sessions in this window.</>,
      children: workloadAnswer ? (
        <BreakdownList
          items={sortedByEdits.map((t) => {
            const meta = getToolMeta(t.host_tool);
            const sessionShare =
              totalSessions > 0 ? Math.round((t.sessions / totalSessions) * 100) : 0;
            return {
              key: t.host_tool,
              label: meta.label,
              fillPct: (t.total_edits / maxEdits) * 100,
              fillColor: meta.color,
              value: (
                <>
                  {fmtCount(t.sessions)} sessions
                  <BreakdownMeta>
                    {' · '}
                    {fmtCount(t.total_edits)} edits · {sessionShare}% share
                    {t.completion_rate > 0 && (
                      <span className={styles.workloadValueSoft}>
                        {t.completion_rate}% complete
                      </span>
                    )}
                  </BreakdownMeta>
                </>
              ),
            };
          })}
        />
      ) : (
        <span className={styles.empty}>Per-tool workload appears once tools record sessions.</span>
      ),
      relatedLinks: getCrossLinks('tools', 'tools', 'workload'),
    },
  ];

  if (workTypeRows.length > 0 && workTypeAnswer) {
    questions.push({
      id: 'work-type',
      question: 'Which tool fits which kind of work?',
      answer: workTypeAnswer,
      children: (
        <div className={styles.workTypeList}>
          {bestFitByType.map((g, i) => (
            <div
              key={g.work_type}
              className={styles.workTypeRow}
              style={{ '--row-index': i } as CSSProperties}
            >
              <div className={styles.workTypeHead}>
                <span className={styles.workTypeLabel}>{g.work_type}</span>
                <span className={styles.workTypeMeta}>
                  {g.winner ? (
                    <>
                      <span
                        className={styles.workTypeDot}
                        style={{ background: getToolMeta(g.winner.host_tool).color }}
                      />
                      <span className={styles.workTypeWinner}>
                        {getToolMeta(g.winner.host_tool).label}
                      </span>
                      <span className={styles.workTypeWinnerRate}>
                        {g.winner.completion_rate}% complete
                      </span>
                    </>
                  ) : (
                    <span className={styles.workTypeMeta}>—</span>
                  )}
                </span>
              </div>
              <div className={styles.workTypeStrip}>
                {workTypeByType
                  .find((w) => w.work_type === g.work_type)!
                  .rows.map((row) => {
                    const meta = getToolMeta(row.host_tool);
                    const enough = row.sessions >= MIN_TOOL_SAMPLE;
                    return (
                      <span
                        key={row.host_tool}
                        className={styles.workTypeCell}
                        style={{ '--tool-brand': meta.color } as CSSProperties}
                      >
                        <span className={styles.workTypeCellDot} />
                        <span className={styles.workTypeCellLabel}>{meta.label}</span>
                        <span className={styles.workTypeCellRate}>
                          {enough ? `${row.completion_rate}%` : '—'}
                        </span>
                        <span className={styles.workTypeCellSessions}>{row.sessions}s</span>
                      </span>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
      ),
      relatedLinks: getCrossLinks('tools', 'tools', 'work-type'),
    });
  } else {
    questions.push({
      id: 'work-type',
      question: 'Which tool fits which kind of work?',
      answer: <>Work-type fit appears once tools record edits across multiple work-types.</>,
      children: <GhostRows count={3} />,
    });
  }

  if (sortedOneShot.length > 0) {
    questions.push({
      id: 'one-shot',
      question: 'Which tool lands edits without a retry loop?',
      answer: oneShotAnswer ?? (
        <>
          Sample under <Metric>{MIN_TOOL_SAMPLE}</Metric> sessions per tool, first-try rate shown
          but not ranked.
        </>
      ),
      children: (
        <BreakdownList
          items={sortedOneShot.map((r) => {
            const meta = getToolMeta(r.host_tool);
            const enough = r.sessions >= MIN_TOOL_SAMPLE;
            return {
              key: r.host_tool,
              label: meta.label,
              fillPct: enough ? r.one_shot_rate : (r.sessions / maxOneShotSessions) * 100,
              fillColor: meta.color,
              value: (
                <>
                  {enough ? `${r.one_shot_rate}% first try` : '—'}
                  <BreakdownMeta>
                    {' · '}
                    {fmtCount(r.sessions)} sessions
                  </BreakdownMeta>
                </>
              ),
            };
          })}
        />
      ),
      relatedLinks: getCrossLinks('tools', 'tools', 'one-shot'),
    });
  } else {
    questions.push({
      id: 'one-shot',
      question: 'Which tool lands edits without a retry loop?',
      answer: <>First-try rate appears once tools log Edit and Bash tool calls.</>,
      children: <GhostRows count={3} />,
    });
  }

  if (modelRows.length > 0 && modelsAnswer) {
    questions.push({
      id: 'models',
      question: 'Which models are running, and through which tools?',
      answer: modelsAnswer,
      children: <ModelsBlock rows={modelRows} />,
    });
  } else {
    questions.push({
      id: 'models',
      question: 'Which models are running, and through which tools?',
      answer: <>Model data appears as tools with token or tool-call logs run sessions.</>,
      children: (
        <>
          <span className={styles.empty}>
            Model data appears as tools with token or tool-call logs run sessions.
          </span>
          <CoverageNote text={tokenNote} />
        </>
      ),
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

function ModelsBlock({ rows }: { rows: ReturnType<typeof aggregateModels> }) {
  return (
    <div className={styles.modelList}>
      {rows.map((m, i) => (
        <div
          key={m.model}
          className={styles.modelRow}
          style={{ '--row-index': i } as CSSProperties}
        >
          <div className={styles.modelHead}>
            <span className={styles.modelName}>{m.model}</span>
            <div className={styles.modelStats}>
              <span className={styles.modelStat}>
                <span className={styles.modelStatValue}>{fmtCount(m.total)}</span> sessions
              </span>
              <span className={styles.modelStat}>
                <span className={styles.modelStatValue}>{fmtCount(m.edits)}</span> edits
              </span>
              {m.avgMin > 0 && (
                <span className={styles.modelStat}>
                  <span className={styles.modelStatValue}>{m.avgMin.toFixed(1)}m</span> avg
                </span>
              )}
              {m.rate > 0 && (
                <span className={styles.modelStat}>
                  <span className={styles.modelStatValue}>{m.rate}%</span>
                </span>
              )}
            </div>
          </div>
          {m.byTool.length > 0 && (
            <div className={styles.modelToolStrip}>
              {m.byTool.map((t) => {
                if (t.host_tool === 'unknown') {
                  return (
                    <span key="unknown" className={styles.modelToolPill}>
                      <span className={styles.modelToolDot} />
                      <span className={styles.modelToolLabel}>unattributed</span>
                      <span className={styles.modelToolCount}>{t.count}</span>
                    </span>
                  );
                }
                const meta = getToolMeta(t.host_tool);
                return (
                  <span
                    key={t.host_tool}
                    className={styles.modelToolPill}
                    style={{ '--tool-brand': meta.color } as CSSProperties}
                  >
                    <span className={styles.modelToolDot} />
                    <span className={styles.modelToolLabel}>{meta.label}</span>
                    <span className={styles.modelToolCount}>{t.count}</span>
                  </span>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
