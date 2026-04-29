import { type ReactNode } from 'react';

import type { PersonalTotals } from '../../../hooks/useGlobalRank.js';
import type { GlobalAverages } from '../../../hooks/useGlobalStats.js';

import { SectionHead } from '../components/SectionHead.js';
import { formatNum } from '../format.js';
import styles from '../GlobalView.module.css';

function PersonalStat({
  value,
  label,
  userValue,
  communityValue,
}: {
  value: string;
  label: string;
  /** User's raw value on the same scale as communityValue. */
  userValue: number;
  communityValue: number;
}): ReactNode {
  // Always render the spark so every card in the strip shares the same
  // visual structure, a zero-data card should read as "waiting for data,"
  // not "broken or missing." When both values are zero, the track renders
  // empty with a muted caption; this is honest about the absence without
  // breaking the rhythm of the row.
  const hasAnyData = userValue > 0 || communityValue > 0;
  const max = hasAnyData ? Math.max(userValue, communityValue) * 1.2 : 1;
  const userPct = hasAnyData ? Math.min(100, (userValue / max) * 100) : 0;
  const communityPct = hasAnyData ? Math.min(100, (communityValue / max) * 100) : 0;
  const direction = userValue >= communityValue ? 'above' : 'below';

  let caption: ReactNode;
  let captionClass = styles.personalSpark_neutral;
  if (!hasAnyData) {
    caption = 'no community data yet';
  } else if (communityValue === 0) {
    caption = 'no peer average yet';
  } else {
    caption = `${direction === 'above' ? '↑' : '↓'} avg ${communityValue.toLocaleString()}`;
    captionClass = styles[`personalSpark_${direction}`];
  }

  return (
    <div className={styles.personalStat}>
      <span className={styles.personalValue}>{value}</span>
      <span className={styles.personalLabel}>{label}</span>
      <div className={styles.personalSpark} title="you vs community average">
        <div className={styles.personalSparkTrack}>
          <div className={styles.personalSparkUserFill} style={{ width: `${userPct}%` }} />
          {hasAnyData && communityValue > 0 && (
            <div
              className={styles.personalSparkCommunity}
              style={{ left: `${communityPct}%` }}
              aria-hidden="true"
            />
          )}
        </div>
        <span className={`${styles.personalSparkCaption} ${captionClass}`}>{caption}</span>
      </div>
    </div>
  );
}

function OutcomeBreakdown({
  completed,
  abandoned,
  failed,
  total,
}: {
  completed: number;
  abandoned: number;
  failed: number;
  total: number;
}): ReactNode {
  const pcts =
    total > 0
      ? {
          completed: (completed / total) * 100,
          abandoned: (abandoned / total) * 100,
          failed: (failed / total) * 100,
          unknown: Math.max(0, ((total - completed - abandoned - failed) / total) * 100),
        }
      : { completed: 0, abandoned: 0, failed: 0, unknown: 100 };

  return (
    <div className={styles.outcomeBreakdown}>
      <div className={styles.outcomeBar}>
        {pcts.completed > 0 && (
          <div
            className={styles.outcomeSegment}
            style={{ width: `${pcts.completed}%`, background: 'var(--success)' }}
          />
        )}
        {pcts.abandoned > 0 && (
          <div
            className={styles.outcomeSegment}
            style={{ width: `${pcts.abandoned}%`, background: 'var(--warn)' }}
          />
        )}
        {pcts.failed > 0 && (
          <div
            className={styles.outcomeSegment}
            style={{ width: `${pcts.failed}%`, background: 'var(--danger)' }}
          />
        )}
        {pcts.unknown > 0 && (
          <div
            className={styles.outcomeSegment}
            style={{ width: `${pcts.unknown}%`, background: 'var(--hairline)' }}
          />
        )}
      </div>
      <div className={styles.outcomeLegend}>
        <span className={styles.outcomeItem}>
          <span className={styles.outcomeDot} style={{ background: 'var(--success)' }} />
          {completed} finished
        </span>
        <span className={styles.outcomeItem}>
          <span className={styles.outcomeDot} style={{ background: 'var(--warn)' }} />
          {abandoned} abandoned
        </span>
        <span className={styles.outcomeItem}>
          <span className={styles.outcomeDot} style={{ background: 'var(--danger)' }} />
          {failed} failed
        </span>
      </div>
    </div>
  );
}

interface Props {
  totals: PersonalTotals;
  averages: GlobalAverages;
}

export function YourTotalsSection({ totals, averages }: Props): ReactNode {
  const t = totals;
  const avg = averages;
  return (
    <section className={styles.section}>
      <SectionHead label="Your Totals" />
      <div className={styles.personalStrip}>
        <PersonalStat
          value={formatNum(t.totalSessions)}
          label="sessions"
          userValue={t.totalSessions}
          communityValue={avg.total_sessions}
        />
        <PersonalStat
          value={formatNum(t.totalEdits)}
          label="edits"
          userValue={t.totalEdits}
          communityValue={avg.total_edits}
        />
        <PersonalStat
          value={formatNum(t.totalLinesAdded)}
          label="lines written"
          userValue={t.totalLinesAdded}
          communityValue={avg.total_lines_added}
        />
        <PersonalStat
          value={String(Math.round(t.totalDurationMin / 60))}
          label="focus hours"
          userValue={t.totalDurationMin / 60}
          communityValue={avg.focus_hours}
        />
        <PersonalStat
          value={formatNum(t.totalInputTokens + t.totalOutputTokens)}
          label="tokens used"
          userValue={t.totalInputTokens + t.totalOutputTokens}
          communityValue={avg.total_tokens}
        />
        <PersonalStat
          value={String(t.totalMemoriesSaved)}
          label="memories saved"
          userValue={t.totalMemoriesSaved}
          communityValue={avg.total_memories}
        />
      </div>
      <OutcomeBreakdown
        completed={t.completedSessions}
        abandoned={t.abandonedSessions}
        failed={t.failedSessions}
        total={t.totalSessions}
      />
    </section>
  );
}
