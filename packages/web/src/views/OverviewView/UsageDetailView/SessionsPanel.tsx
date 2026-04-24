import { useMemo, type CSSProperties } from 'react';
import clsx from 'clsx';
import {
  DetailSection,
  DotMatrix,
  HeroStatRow,
  LegendDot,
  LegendHatch,
  type HeroStatDef,
} from '../../../components/DetailView/index.js';
import type { UserAnalytics } from '../../../lib/apiSchemas.js';
import { fmtCount, formatStripDate } from './shared.js';
import ToolRing from './ToolRing.js';
import styles from './UsageDetailView.module.css';

// Horizontal stacked strip — labels on top, continuous bar in the middle,
// counts beneath each segment. Segments share a baseline so label/bar/count
// stay in columns that flex to the bucket's share. Palette-wide ink-alpha
// spread so adjacent buckets read as distinctly different steps, not a
// single murky gray.
function DurationStrip({ buckets }: { buckets: UserAnalytics['duration_distribution'] }) {
  const total = Math.max(
    1,
    buckets.reduce((s, b) => s + b.count, 0),
  );
  const n = Math.max(1, buckets.length);
  // Spread from 20% → 100% ink so even 3 buckets read as three distinct
  // steps. Reference point: the FACIAL THIRDS pattern uses three visibly
  // different grays; linear alpha interpolation gives the same feel.
  const tintPct = (i: number): number => Math.round(20 + (i / Math.max(1, n - 1)) * 80);
  return (
    <div className={styles.durationCols}>
      {buckets.map((b, i) => {
        const pct = tintPct(i);
        const share = Math.round((b.count / total) * 100);
        return (
          <div
            key={b.bucket}
            className={styles.durationCol}
            style={
              {
                flex: Math.max(1, b.count),
                '--row-index': i,
              } as CSSProperties
            }
            title={`${b.bucket} · ${b.count} sessions`}
          >
            <span className={styles.durationColLabel}>{b.bucket}</span>
            <div
              className={styles.durationColSeg}
              style={{
                background: `color-mix(in srgb, var(--ink) ${pct}%, transparent)`,
              }}
            />
            <span className={styles.durationColValue}>
              {fmtCount(b.count)}
              <span className={styles.durationColMeta}> · {share}%</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Per-day stacked column strip. Column height = total sessions / max total.
// Segments stack bottom-up: completed, abandoned, failed, then unknown.
// Animation delay staggers left-to-right via --col-index to match the
// rowReveal pattern elsewhere.
function DailyOutcomeStrip({
  trends,
  maxTotal,
}: {
  trends: UserAnalytics['daily_trends'];
  maxTotal: number;
}) {
  const labelSpacing = Math.max(1, Math.floor(trends.length / 6));
  return (
    <div className={styles.strip}>
      <div className={styles.stripGrid}>
        {trends.map((row, i) => {
          const total = row.sessions;
          const unknown = Math.max(0, total - row.completed - row.abandoned - row.failed);
          const columnHeightPct = (total / maxTotal) * 100;
          return (
            <div
              key={row.day}
              className={styles.stripCol}
              style={{ '--col-index': i } as CSSProperties}
              title={`${row.day} · ${total} sessions`}
            >
              <div className={styles.stripColInner}>
                <div className={styles.stripColStack} style={{ height: `${columnHeightPct}%` }}>
                  {row.completed > 0 && (
                    <div
                      className={styles.stripSeg}
                      style={{
                        flex: row.completed,
                        background: 'var(--success)',
                      }}
                    />
                  )}
                  {row.abandoned > 0 && (
                    <div
                      className={styles.stripSeg}
                      style={{
                        flex: row.abandoned,
                        background: 'var(--warn)',
                      }}
                    />
                  )}
                  {row.failed > 0 && (
                    <div
                      className={styles.stripSeg}
                      style={{
                        flex: row.failed,
                        background: 'var(--danger)',
                      }}
                    />
                  )}
                  {unknown > 0 && (
                    <div
                      className={clsx(styles.stripSeg, styles.stripSegHatch)}
                      style={{ flex: unknown }}
                    />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className={styles.stripAxis}>
        {trends.map((row, i) => (
          <span
            key={row.day}
            className={styles.stripAxisLabel}
            data-visible={
              i === 0 || i === trends.length - 1 || i % labelSpacing === 0 ? 'true' : 'false'
            }
          >
            {formatStripDate(row.day)}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function SessionsPanel({ analytics }: { analytics: UserAnalytics }) {
  const cs = analytics.completion_summary;
  const totalSessions = analytics.daily_trends.reduce((s, d) => s + d.sessions, 0);
  const stuck = analytics.stuckness;
  const firstEdit = analytics.first_edit_stats;

  const byTool = useMemo(() => {
    return [...analytics.tool_comparison]
      .filter((t) => t.sessions > 0)
      .sort((a, b) => b.sessions - a.sessions);
  }, [analytics]);

  const durationDist = analytics.duration_distribution.filter((b) => b.count > 0);

  // Daily outcome strip — per-day stacked column (completed/abandoned/failed,
  // unknown on top). Replaces separate outcome-split bar + daily-trend
  // sparkline: one viz answers "what's the mix" and "how is it trending".
  const dailyMaxTotal = Math.max(1, ...analytics.daily_trends.map((row) => row.sessions));

  if (totalSessions === 0) {
    return <span className={styles.empty}>No sessions captured in this window.</span>;
  }

  // Session-health hero: two ratio-based quality stats (completed,
  // stalled), each paired with a DotMatrix so the number has literal
  // visual reference. First-edit is timing/onboarding (lives next to
  // duration); period delta lives on the SESSIONS tab itself — both
  // intentionally excluded here so the row stays cohesive and visually
  // balanced against the BY TOOL column across the gap.
  const heroStats: HeroStatDef[] = [];
  if (cs.total_sessions > 0 && cs.completion_rate > 0) {
    heroStats.push({
      key: 'completed',
      value: String(Math.round(cs.completion_rate)),
      unit: '%',
      label: 'completed',
      sublabel: `${fmtCount(cs.completed)} of ${fmtCount(cs.total_sessions)} sessions`,
      color: 'var(--success)',
      viz: <DotMatrix total={cs.total_sessions} filled={cs.completed} color="var(--success)" />,
    });
  }
  if (stuck.total_sessions > 0 && stuck.stuck_sessions > 0) {
    const rate = Math.round(stuck.stuckness_rate);
    const color = rate >= 40 ? 'var(--danger)' : rate >= 15 ? 'var(--warn)' : 'var(--ink)';
    heroStats.push({
      key: 'stalled',
      value: String(rate),
      unit: '%',
      label: 'stalled 15+ min',
      sublabel: `${fmtCount(stuck.stuck_sessions)} of ${fmtCount(stuck.total_sessions)} sessions`,
      color,
      viz: <DotMatrix total={stuck.total_sessions} filled={stuck.stuck_sessions} color={color} />,
    });
  }

  const hasHero = heroStats.length > 0;
  const firstEditMin = firstEdit.median_minutes_to_first_edit;
  const firstEditDisplay =
    firstEditMin > 0
      ? firstEditMin >= 10
        ? String(Math.round(firstEditMin))
        : firstEditMin.toFixed(1)
      : null;

  return (
    <>
      {/* Top grid: hero stats (left) + tool share (right). Both sit at the
          fold, establishing the session story: what happened (hero) and
          where (by tool). Session duration lives below as its own full
          width band since it answers a different question (how long). */}
      {(hasHero || byTool.length > 0) && (
        <div className={clsx(styles.topGrid, styles.topGridSessions)}>
          {hasHero && (
            <DetailSection label="Session health" className={styles.sectionHero}>
              <HeroStatRow stats={heroStats} direction="column" />
            </DetailSection>
          )}
          {byTool.length > 0 && (
            <DetailSection label="By tool">
              <ToolRing entries={byTool} total={totalSessions} />
            </DetailSection>
          )}
        </div>
      )}

      {/* Daily outcome strip — subsumes outcome split + daily trend */}
      {analytics.daily_trends.length >= 2 && (
        <DetailSection label="Daily outcome mix">
          <DailyOutcomeStrip trends={analytics.daily_trends} maxTotal={dailyMaxTotal} />
          <div className={styles.stripLegend}>
            <LegendDot color="var(--success)" label="completed" />
            <LegendDot color="var(--warn)" label="abandoned" />
            <LegendDot color="var(--danger)" label="failed" />
            <LegendHatch label="no outcome" />
          </div>
        </DetailSection>
      )}

      {/* Session duration — full-width band. First-edit median rides
          along as a small lead-in caption since both metrics answer
          "how long did things take" (warmup vs total session length). */}
      {durationDist.length > 0 && (
        <DetailSection label="Session duration">
          {firstEditDisplay && (
            <p className={styles.durationLeadIn}>
              <span className={styles.durationLeadValue}>{firstEditDisplay}</span>
              <span className={styles.durationLeadUnit}>min</span>
              <span className={styles.durationLeadLabel}>median to first edit</span>
              {totalSessions > 0 && (
                <span className={styles.durationLeadContext}>
                  · across {fmtCount(totalSessions)} sessions
                </span>
              )}
            </p>
          )}
          <DurationStrip buckets={durationDist} />
        </DetailSection>
      )}
    </>
  );
}
