import { useMemo, type ReactNode } from 'react';

import type { MetricRank, PersonalTotals } from '../../../hooks/useGlobalRank.js';
import type { GlobalAverages, GlobalStats } from '../../../hooks/useGlobalStats.js';

import { SectionHead } from '../components/SectionHead.js';
import { formatNum } from '../format.js';
import styles from '../GlobalView.module.css';

// Percentile cards, 2 reusable viz idioms:
//   - BarCard:  1-D position, user marker on track. For metrics with no
//               community distribution available (velocity, stuck, focus, ...).
//   - DistCard: bracket histogram with user's bracket lit. For metrics where
//               the backend exposes a real community distribution
//               (completion_rate, tool_count).

interface VizProps {
  metric: string;
  percentile: number;
  value: string;
  unit?: string;
  lowLabel?: string;
  highLabel?: string;
  context?: string;
}

function BarCard({
  metric,
  percentile,
  value,
  unit,
  lowLabel,
  highLabel,
  context,
}: VizProps): ReactNode {
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <span className={styles.cardMetric}>{metric}</span>
        <span className={styles.cardPercentile}>
          {Math.round(percentile)}
          <span className={styles.cardSuffix}>th</span>
        </span>
      </div>
      <div className={styles.barWrap}>
        <div className={styles.barTrack}>
          <div className={styles.barFill} style={{ width: `${percentile}%` }} />
          {/* Community median reference tick. Sits behind the user marker so
              whenever the user is near 50 the hierarchy reads user-on-top.
              Accent color names it as "where the community center is." */}
          <div className={styles.barMedianTick} aria-hidden="true" />
          <div className={styles.barMarker} style={{ left: `${percentile}%` }} />
        </div>
        <div className={styles.barLabels}>
          <span className={styles.barLabel}>{lowLabel}</span>
          <span className={styles.barLabel}>{highLabel}</span>
        </div>
      </div>
      <div className={styles.cardValueRow}>
        <span className={styles.cardValue}>{value}</span>
        {unit && <span className={styles.cardUnit}>{unit}</span>}
      </div>
      {context && <span className={styles.cardContext}>{context}</span>}
    </div>
  );
}

function DistCard({
  metric,
  percentile,
  value,
  unit,
  distribution,
  userBucket,
  context,
}: VizProps & {
  distribution: Array<{ label: string; pct: number }>;
  userBucket: string | null;
}): ReactNode {
  const maxPct = Math.max(...distribution.map((d) => d.pct), 1);
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <span className={styles.cardMetric}>{metric}</span>
        <span className={styles.cardPercentile}>
          {Math.round(percentile)}
          <span className={styles.cardSuffix}>th</span>
        </span>
      </div>
      <div className={styles.histoWrap}>
        {distribution.length === 0 ? (
          <div className={styles.histoEmpty} />
        ) : (
          distribution.map((d) => (
            <div key={d.label} className={styles.histoCol}>
              <div className={styles.histoBarWrap}>
                <div
                  className={`${styles.histoBar} ${d.label === userBucket ? styles.histoBarActive : ''}`}
                  style={{ height: `${(d.pct / maxPct) * 100}%` }}
                />
              </div>
              <span
                className={`${styles.histoLabel} ${d.label === userBucket ? styles.histoLabelActive : ''}`}
              >
                {d.label}
              </span>
            </div>
          ))
        )}
      </div>
      <div className={styles.cardValueRow}>
        <span className={styles.cardValue}>{value}</span>
        {unit && <span className={styles.cardUnit}>{unit}</span>}
      </div>
      {context && <span className={styles.cardContext}>{context}</span>}
    </div>
  );
}

interface Props {
  metrics: Record<string, MetricRank>;
  totals: PersonalTotals;
  averages: GlobalAverages;
  stats: GlobalStats;
  hasEnoughSessions: boolean;
  sessionsRemaining: number;
  totalDevelopers: number;
}

export function YourRankSection({
  metrics,
  totals,
  averages,
  stats,
  hasEnoughSessions,
  sessionsRemaining,
  totalDevelopers,
}: Props): ReactNode {
  const m = metrics;
  const t = totals;
  const avg = averages;

  // Community completion-rate bracket histogram, used by the "Sessions
  // completed" DistCard. Percentages are share of developers per bracket.
  const completionHisto = useMemo(() => {
    if (stats.completionDistribution.length === 0) return [];
    const totalUsers = stats.completionDistribution.reduce((s, d) => s + (d.users as number), 0);
    return stats.completionDistribution.map((d) => ({
      label: String(d.bracket),
      pct: totalUsers > 0 ? Math.round(((d.users as number) / totalUsers) * 100) : 0,
    }));
  }, [stats.completionDistribution]);

  const userCompletionRate = m.completion_rate?.value ?? 0;
  const userCompletionBracket = useMemo(() => {
    if (userCompletionRate >= 90) return '90-100';
    if (userCompletionRate >= 80) return '80-89';
    if (userCompletionRate >= 70) return '70-79';
    if (userCompletionRate >= 60) return '60-69';
    if (userCompletionRate >= 50) return '50-59';
    return '0-49';
  }, [userCompletionRate]);

  // Community tool-count histogram, how many distinct tools each developer
  // uses. Computed at /stats. Surfaces the user's own tool count against
  // the community distribution.
  const toolCountHisto = useMemo(() => {
    if (stats.toolCountDistribution.length === 0) return [];
    const totalUsers = stats.toolCountDistribution.reduce((s, d) => s + d.users, 0);
    return stats.toolCountDistribution.map((d) => ({
      label: String(d.count),
      pct: totalUsers > 0 ? Math.round((d.users / totalUsers) * 100) : 0,
    }));
  }, [stats.toolCountDistribution]);

  const userToolCount = m.tool_diversity?.value ?? 0;

  return (
    <section className={styles.section}>
      <SectionHead
        label={`Your Rank${totalDevelopers > 0 ? ` among ${totalDevelopers.toLocaleString()} developers` : ''}`}
      />
      {!hasEnoughSessions && (
        <p className={styles.gateMessage}>
          Complete {sessionsRemaining} more session{sessionsRemaining === 1 ? '' : 's'} to unlock
          percentile rankings.
        </p>
      )}
      <div
        className={styles.percentileGrid}
        style={!hasEnoughSessions ? { opacity: 0.35, pointerEvents: 'none' } : undefined}
      >
        <DistCard
          metric="Sessions completed"
          percentile={hasEnoughSessions ? (m.completion_rate?.percentile ?? 0) : 0}
          value={hasEnoughSessions ? `${m.completion_rate?.value ?? 0}%` : '--'}
          distribution={completionHisto}
          userBucket={hasEnoughSessions ? userCompletionBracket : null}
          context="Distribution of completion rates across all developers."
        />
        <BarCard
          metric="Time to first edit"
          percentile={hasEnoughSessions ? (m.first_edit_latency?.percentile ?? 0) : 0}
          value={hasEnoughSessions ? `${m.first_edit_latency?.value ?? 0}s` : '--'}
          lowLabel="Slower"
          highLabel="Faster"
          context={
            avg.first_edit_s > 0
              ? `The average developer waits ${avg.first_edit_s}s for their first edit.`
              : undefined
          }
        />
        <BarCard
          metric="Agent reliability"
          percentile={hasEnoughSessions ? (m.stuck_rate?.percentile ?? 0) : 0}
          value={hasEnoughSessions ? `${100 - (m.stuck_rate?.value ?? 0)}%` : '--'}
          lowLabel="Less reliable"
          highLabel="More reliable"
          context={
            t.totalStuck > 0
              ? `Your agents have stalled ${t.totalStuck} time${t.totalStuck === 1 ? '' : 's'} across all sessions.`
              : 'No stuck sessions recorded yet.'
          }
        />
        <BarCard
          metric="Edits per minute"
          percentile={hasEnoughSessions ? (m.edit_velocity?.percentile ?? 0) : 0}
          value={hasEnoughSessions ? String(m.edit_velocity?.value ?? 0) : '--'}
          lowLabel="Slower"
          highLabel="Faster"
          context={
            avg.edit_velocity > 0
              ? `The community averages ${avg.edit_velocity} edits per minute.`
              : undefined
          }
        />
        <BarCard
          metric="Output per session"
          percentile={hasEnoughSessions ? (m.lines_per_session?.percentile ?? 0) : 0}
          value={hasEnoughSessions ? (m.lines_per_session?.value ?? 0).toLocaleString() : '--'}
          unit="lines"
          lowLabel="Less"
          highLabel="More"
          context={
            avg.lines_per_session > 0
              ? `The average developer writes ${avg.lines_per_session.toLocaleString()} lines per session.`
              : undefined
          }
        />
        <BarCard
          metric="Code written"
          percentile={hasEnoughSessions ? (m.total_lines?.percentile ?? 0) : 0}
          value={hasEnoughSessions ? formatNum(m.total_lines?.value ?? 0) : '--'}
          unit="lines total"
          lowLabel="Less"
          highLabel="More"
          context={
            m.total_lines?.percentile != null && m.total_lines.percentile >= 50
              ? `You've written more code with AI than ${Math.round(m.total_lines.percentile)}% of developers.`
              : 'Your lifetime code output with AI agents.'
          }
        />
        <BarCard
          metric="Focus time"
          percentile={hasEnoughSessions ? (m.focus_hours?.percentile ?? 0) : 0}
          value={hasEnoughSessions ? String(m.focus_hours?.value ?? 0) : '--'}
          unit="hours"
          lowLabel="Less"
          highLabel="More"
          context={
            avg.focus_hours > 0
              ? `The average developer logs ${avg.focus_hours} hours of focused AI time.`
              : undefined
          }
        />
        <DistCard
          metric="Tools used"
          percentile={hasEnoughSessions ? (m.tool_diversity?.percentile ?? 0) : 0}
          value={hasEnoughSessions ? String(m.tool_diversity?.value ?? 0) : '--'}
          distribution={toolCountHisto}
          userBucket={hasEnoughSessions ? String(userToolCount) : null}
          context="How many AI tools each developer uses."
        />
      </div>
    </section>
  );
}
