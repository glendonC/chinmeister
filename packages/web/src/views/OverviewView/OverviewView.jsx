import { useMemo, useState } from 'react';
import { usePollingStore } from '../../lib/stores/polling.js';
import { useAuthStore } from '../../lib/stores/auth.js';
import { useTeamStore } from '../../lib/stores/teams.js';
import { getColorHex } from '../../lib/utils.js';
import { getToolMeta } from '../../lib/toolMeta.js';
import { projectGradient } from '../../lib/projectGradient.js';
import ToolIcon from '../../components/ToolIcon/ToolIcon.jsx';
import EmptyState from '../../components/EmptyState/EmptyState.jsx';
import styles from './OverviewView.module.css';

// ── Arc ring ──
const CX = 130, CY = 130, R = 58, SW = 13, GAP = 14;
const DEG = Math.PI / 180;
function arcPath(cx, cy, r, startDeg, sweepDeg) {
  const s = (startDeg - 90) * DEG, e = (startDeg + sweepDeg - 90) * DEG;
  return `M ${cx + r * Math.cos(s)} ${cy + r * Math.sin(s)} A ${r} ${r} 0 ${sweepDeg > 180 ? 1 : 0} 1 ${cx + r * Math.cos(e)} ${cy + r * Math.sin(e)}`;
}

export default function OverviewView() {
  const dashboardData = usePollingStore((s) => s.dashboardData);
  const user = useAuthStore((s) => s.user);
  const teamsError = useTeamStore((s) => s.teamsError);
  const selectTeam = useTeamStore((s) => s.selectTeam);
  const summaries = dashboardData?.teams ?? [];
  const [activeViz, setActiveViz] = useState('projects');
  const [search, setSearch] = useState('');
  const userColor = getColorHex(user?.color) || '#121317';

  const totalActive = useMemo(() => summaries.reduce((s, t) => s + (t.active_agents || 0), 0), [summaries]);
  const totalMemories = useMemo(() => summaries.reduce((s, t) => s + (t.memory_count || 0), 0), [summaries]);

  const toolUsage = useMemo(() => {
    const totals = new Map();
    for (const team of summaries)
      for (const { tool, joins } of team.tools_configured || [])
        if (getToolMeta(tool).icon) totals.set(tool, (totals.get(tool) || 0) + joins);
    const entries = [...totals.entries()].map(([tool, joins]) => ({ tool, joins })).sort((a, b) => b.joins - a.joins);
    const total = entries.reduce((s, e) => s + e.joins, 0);
    return entries.map((e) => ({ ...e, share: total > 0 ? e.joins / total : 0 }));
  }, [summaries]);

  const uniqueTools = toolUsage.length;

  const arcs = useMemo(() => {
    if (!toolUsage.length) return [];
    const totalGap = GAP * toolUsage.length, available = 360 - totalGap;
    let offset = 0;
    return toolUsage.map((entry) => {
      const sweep = Math.max(entry.share * available, 4);
      const midDeg = (offset + sweep / 2 - 90) * DEG;
      const labelR = R + SW / 2 + 22;
      const anchorR = R + SW / 2 + 5;
      const arc = { ...entry, startDeg: offset, sweepDeg: sweep,
        labelX: CX + labelR * Math.cos(midDeg), labelY: CY + labelR * Math.sin(midDeg),
        anchorX: CX + anchorR * Math.cos(midDeg), anchorY: CY + anchorR * Math.sin(midDeg),
        side: Math.cos(midDeg) >= 0 ? 'right' : 'left' };
      offset += sweep + GAP;
      return arc;
    });
  }, [toolUsage]);

  // Agents: per-project, per-tool breakdown
  const agentRows = useMemo(() => {
    const rows = [];
    for (const team of summaries)
      for (const t of (team.tools_configured || []).filter((t) => getToolMeta(t.tool).icon && t.joins > 0))
        rows.push({ tool: t.tool, teamName: team.team_name || team.team_id, teamId: team.team_id, joins: t.joins });
    return rows.sort((a, b) => b.joins - a.joins);
  }, [summaries]);

  // Filtered projects
  const filteredProjects = useMemo(() => {
    if (!search.trim()) return summaries;
    const q = search.trim().toLowerCase();
    return summaries.filter((t) => (t.team_name || t.team_id).toLowerCase().includes(q));
  }, [summaries, search]);

  if (summaries.length === 0) {
    return (
      <div className={styles.overview}>
        <EmptyState large title={teamsError ? 'Could not load projects' : 'No projects yet'}
          hint={teamsError || <>Run <code>npx chinwag init</code> in a repo to add one.</>} />
      </div>
    );
  }

  const stats = [
    { id: 'projects', label: 'Projects', value: summaries.length, tone: '' },
    { id: 'agents', label: 'Agents live', value: totalActive, tone: totalActive > 0 ? 'accent' : '' },
    { id: 'tools', label: 'Tools', value: uniqueTools, tone: '' },
    { id: 'memories', label: 'Memories', value: totalMemories, tone: '' },
  ];

  return (
    <div className={styles.overview}>
      <section className={styles.header}>
        <div className={styles.welcomeBlock}>
          <span className={styles.eyebrow}>Overview</span>
          <h1 className={styles.title}>
            Welcome back{user?.handle ? <>{', '}<span style={{ color: userColor }}>{user.handle}</span></> : null}.
          </h1>
        </div>
        <div className={styles.statsRow}>
          {stats.map((s) => (
            <button key={s.id} type="button"
              className={`${styles.statButton} ${activeViz === s.id ? styles.statActive : ''}`}
              onClick={() => setActiveViz(s.id)}>
              <span className={styles.statLabel}>{s.label}</span>
              <span className={`${styles.statValue} ${s.tone === 'accent' ? styles.statAccent : ''}`}>{s.value}</span>
            </button>
          ))}
        </div>
      </section>

      <section className={styles.vizArea}>

        {/* ── PROJECTS ── */}
        {activeViz === 'projects' && (
          <div className={styles.vizPanel}>
            {summaries.length > 3 && (
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search projects" className={styles.searchInput} />
            )}
            <div className={styles.tableWrap}>
              <div className={styles.tableHead}>
                <span className={styles.thLeft}>Name</span>
                <span className={styles.th}>Live</span>
                <span className={styles.th}>Memories</span>
                <span className={styles.th}>Tools</span>
              </div>
              <div className={styles.tableBody}>
                {filteredProjects.map((team) => {
                  const agents = team.active_agents || 0;
                  const toolCount = (team.tools_configured || []).filter((t) => getToolMeta(t.tool).icon).length;
                  return (
                    <button key={team.team_id} type="button" className={styles.tableRow} onClick={() => selectTeam(team.team_id)}>
                      <span className={styles.tdLeft}>
                        <span className={styles.squircle} style={{ background: projectGradient(team.team_id) }} />
                        {team.team_name || team.team_id}
                      </span>
                      <span className={`${styles.td} ${agents > 0 ? styles.tdAccent : ''}`}>{agents}</span>
                      <span className={styles.td}>{team.memory_count || 0}</span>
                      <span className={styles.td}>{toolCount}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── AGENTS LIVE ── */}
        {activeViz === 'agents' && (
          <div className={styles.vizPanel}>
            {agentRows.length > 0 ? (
              <div className={styles.tableWrap}>
                <div className={styles.tableHead}>
                  <span className={styles.thLeft}>Tool</span>
                  <span className={styles.thLeft}>Project</span>
                  <span className={styles.th}>Sessions</span>
                </div>
                <div className={styles.tableBody}>
                  {agentRows.map((agent, i) => {
                    const meta = getToolMeta(agent.tool);
                    return (
                      <div key={`${agent.teamId}-${agent.tool}-${i}`} className={styles.tableRow}>
                        <span className={styles.tdLeft}>
                          <span className={styles.toolDot} style={{ background: meta.color }} />
                          <ToolIcon tool={agent.tool} size={16} />
                          {meta.label}
                        </span>
                        <span className={styles.tdLeftMuted}>{agent.teamName}</span>
                        <span className={styles.td}>{agent.joins}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className={styles.emptyHint}>No agent activity recorded yet.</p>
            )}
          </div>
        )}

        {/* ── TOOLS ── */}
        {activeViz === 'tools' && (
          <div className={styles.vizPanel}>
            {arcs.length > 0 ? (
              <div className={styles.toolsViz}>
                <div className={styles.ringWrap}>
                  <svg viewBox="0 0 260 260" className={styles.ringSvg}>
                    {arcs.map((arc) => {
                      const meta = getToolMeta(arc.tool);
                      return (
                        <g key={arc.tool}>
                          <path d={arcPath(CX, CY, R, arc.startDeg, arc.sweepDeg)} fill="none" stroke={meta.color} strokeWidth={SW} strokeLinecap="round" opacity="0.8" />
                          <line x1={arc.anchorX} y1={arc.anchorY} x2={arc.labelX} y2={arc.labelY} stroke="var(--faint)" strokeWidth="1" strokeDasharray="2 3" />
                          <text x={arc.labelX} y={arc.labelY - 4} textAnchor={arc.side === 'right' ? 'start' : 'end'} fill={meta.color} fontSize="16" fontWeight="400" fontFamily="var(--display)" letterSpacing="-0.04em">{Math.round(arc.share * 100)}%</text>
                          <text x={arc.labelX} y={arc.labelY + 10} textAnchor={arc.side === 'right' ? 'start' : 'end'} fill="var(--muted)" fontSize="9" fontFamily="var(--sans)" fontWeight="500">{meta.label}</text>
                        </g>
                      );
                    })}
                    <text x={CX} y={CY - 2} textAnchor="middle" dominantBaseline="central" fill="var(--ink)" fontSize="28" fontWeight="200" fontFamily="var(--display)" letterSpacing="-0.06em">{uniqueTools}</text>
                    <text x={CX} y={CY + 16} textAnchor="middle" fill="var(--muted)" fontSize="8.5" fontFamily="var(--mono)" letterSpacing="0.1em">TOOLS</text>
                  </svg>
                </div>

                <div className={styles.toolsLegend}>
                  {toolUsage.map((entry) => {
                    const meta = getToolMeta(entry.tool);
                    const projects = summaries
                      .filter((t) => (t.tools_configured || []).some((tc) => tc.tool === entry.tool))
                      .map((t) => t.team_name || t.team_id);
                    return (
                      <div key={entry.tool} className={styles.legendRow}>
                        <span className={styles.legendDot} style={{ background: meta.color }} />
                        <span className={styles.legendName}>{meta.label}</span>
                        <span className={styles.legendProjects}>{projects.join(', ')}</span>
                        <span className={styles.legendShare}>{Math.round(entry.share * 100)}%</span>
                        <span className={styles.legendSessions}>{entry.joins} session{entry.joins === 1 ? '' : 's'}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className={styles.emptyHint}>No tools connected yet.</p>
            )}
          </div>
        )}

        {/* ── MEMORIES ── */}
        {activeViz === 'memories' && (
          <div className={styles.vizPanel}>
            {totalMemories > 0 ? (
              <div className={styles.tableWrap}>
                <div className={styles.tableHead}>
                  <span className={styles.thLeft}>Project</span>
                  <span className={styles.th}>Count</span>
                  <span className={styles.th}>Share</span>
                </div>
                <div className={styles.tableBody}>
                  {summaries
                    .filter((t) => (t.memory_count || 0) > 0)
                    .sort((a, b) => (b.memory_count || 0) - (a.memory_count || 0))
                    .map((team) => {
                      const count = team.memory_count || 0;
                      const share = totalMemories > 0 ? Math.round((count / totalMemories) * 100) : 0;
                      return (
                        <button key={team.team_id} type="button" className={styles.tableRow} onClick={() => selectTeam(team.team_id)}>
                          <span className={styles.tdLeft}>
                            <span className={styles.squircle} style={{ background: projectGradient(team.team_id) }} />
                            {team.team_name || team.team_id}
                          </span>
                          <span className={styles.td}>{count}</span>
                          <span className={styles.td}>{share}%</span>
                        </button>
                      );
                    })}
                </div>
              </div>
            ) : (
              <p className={styles.emptyHint}>No memories saved yet.</p>
            )}
          </div>
        )}

      </section>
    </div>
  );
}
