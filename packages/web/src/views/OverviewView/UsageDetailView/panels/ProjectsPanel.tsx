import { useMemo, type CSSProperties } from 'react';

import {
  FocusedDetailView,
  Metric,
  type FocusedQuestion,
} from '../../../../components/DetailView/index.js';
import ToolIcon from '../../../../components/ToolIcon/ToolIcon.js';
import { setQueryParam, useQueryParam } from '../../../../lib/router.js';
import { getToolMeta } from '../../../../lib/toolMeta.js';
import type { TeamSummaryLive } from '../../../../lib/apiSchemas.js';
import type { LiveAgent } from '../../../../widgets/types.js';
import shared from '../../../../widgets/widget-shared.module.css';

import { fmtCount } from '../format.js';
import styles from '../UsageDetailView.module.css';

interface Props {
  summaries: TeamSummaryLive[];
  liveAgents: LiveAgent[];
  onOpenProject: (teamId: string) => void;
}

export function ProjectsPanel({ summaries, liveAgents, onOpenProject }: Props) {
  const activeId = useQueryParam('q');
  const liveByTeam = useMemo(() => {
    const map = new Map<string, LiveAgent[]>();
    for (const agent of liveAgents) {
      const list = map.get(agent.teamId) ?? [];
      list.push(agent);
      map.set(agent.teamId, list);
    }
    return map;
  }, [liveAgents]);

  const sortedByActivity = useMemo(
    () =>
      [...summaries].sort((a, b) => {
        const aSessions = sum(a.daily_sessions_7d ?? []);
        const bSessions = sum(b.daily_sessions_7d ?? []);
        return bSessions - aSessions;
      }),
    [summaries],
  );
  const sortedByMemory = useMemo(
    () => [...summaries].sort((a, b) => (b.memory_count ?? 0) - (a.memory_count ?? 0)),
    [summaries],
  );
  const sortedByConflicts = useMemo(
    () => [...summaries].sort((a, b) => (b.conflicts_7d ?? 0) - (a.conflicts_7d ?? 0)),
    [summaries],
  );

  const topActivity = sortedByActivity[0];
  const topConflict = sortedByConflicts[0];
  const topMemory = sortedByMemory[0];

  const questions: FocusedQuestion[] = [
    {
      id: 'overview',
      question: 'Which projects need attention?',
      answer:
        summaries.length > 0 ? (
          <>
            <Metric>{projectName(topActivity)}</Metric> is the busiest project, and{' '}
            <Metric>{projectName(topConflict)}</Metric> has the most conflict signal.
          </>
        ) : (
          <>No projects found.</>
        ),
      children: (
        <ProjectRows
          rows={sortedByConflicts.length > 0 ? sortedByConflicts : sortedByActivity}
          liveByTeam={liveByTeam}
          onOpenProject={onOpenProject}
          valueFor={(s) => `${fmtCount(s.conflicts_7d ?? 0)} conflicts`}
        />
      ),
    },
    {
      id: 'activity',
      question: 'Where is work active?',
      answer:
        topActivity && sum(topActivity.daily_sessions_7d ?? []) > 0 ? (
          <>
            <Metric>{projectName(topActivity)}</Metric> has{' '}
            <Metric>{fmtCount(sum(topActivity.daily_sessions_7d ?? []))}</Metric> sessions across
            the last 7 days.
          </>
        ) : (
          <>No recent project activity in the 7-day summary.</>
        ),
      children: (
        <ProjectRows
          rows={sortedByActivity}
          liveByTeam={liveByTeam}
          onOpenProject={onOpenProject}
          valueFor={(s) => `${fmtCount(sum(s.daily_sessions_7d ?? []))} sessions`}
        />
      ),
    },
    {
      id: 'memory',
      question: 'Which projects are building shared memory?',
      answer:
        topMemory && (topMemory.memory_count ?? 0) > 0 ? (
          <>
            <Metric>{projectName(topMemory)}</Metric> leads with{' '}
            <Metric>{fmtCount(topMemory.memory_count ?? 0)}</Metric> memories.
          </>
        ) : (
          <>No project memory has been recorded yet.</>
        ),
      children: (
        <ProjectRows
          rows={sortedByMemory}
          liveByTeam={liveByTeam}
          onOpenProject={onOpenProject}
          valueFor={(s) => `${fmtCount(s.memory_count ?? 0)} memories`}
        />
      ),
    },
  ];

  return (
    <FocusedDetailView
      questions={questions}
      activeId={activeId}
      onSelect={(id) => setQueryParam('q', id)}
    />
  );
}

function ProjectRows({
  rows,
  liveByTeam,
  onOpenProject,
  valueFor,
}: {
  rows: TeamSummaryLive[];
  liveByTeam: Map<string, LiveAgent[]>;
  onOpenProject: (teamId: string) => void;
  valueFor: (summary: TeamSummaryLive) => string;
}) {
  if (rows.length === 0) return <span className={styles.empty}>No projects found.</span>;
  return (
    <div className={shared.dataList}>
      {rows.map((summary, i) => {
        const agents = liveByTeam.get(summary.team_id) ?? [];
        const tools = summary.hosts_configured.slice(0, 3);
        return (
          <button
            key={summary.team_id}
            type="button"
            className={shared.dataRow}
            style={{ '--row-index': i } as CSSProperties}
            onClick={() => onOpenProject(summary.team_id)}
          >
            <span className={styles.projectDetailName}>{projectName(summary)}</span>
            <span className={styles.projectDetailTools}>
              {tools.map((tool) => {
                const meta = getToolMeta(tool.host_tool);
                const live = agents.some((agent) => agent.host_tool === tool.host_tool);
                return (
                  <span
                    key={tool.host_tool}
                    className={styles.projectDetailTool}
                    title={meta.label}
                    style={{ opacity: live ? 1 : 0.42 }}
                  >
                    <ToolIcon tool={tool.host_tool} size={14} />
                  </span>
                );
              })}
            </span>
            <div className={shared.dataMeta}>
              <span className={shared.dataStat}>{valueFor(summary)}</span>
              <span className={shared.dataStat}>{fmtCount(agents.length)} live</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function projectName(summary: TeamSummaryLive | undefined): string {
  if (!summary) return 'No project';
  return summary.team_name || summary.team_id;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
