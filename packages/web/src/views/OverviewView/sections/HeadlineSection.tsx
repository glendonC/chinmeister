import clsx from 'clsx';
import { Sparkline } from '../overview-charts.js';
import { computeCompletionRates } from '../overview-utils.js';
import { formatDuration } from '../../../lib/utils.js';
import type { UserAnalytics } from '../../../lib/apiSchemas.js';
import styles from '../OverviewView.module.css';

export function HeadlineSection({
  analytics,
  projectCount,
  liveAgentCount,
}: {
  analytics: UserAnalytics;
  projectCount: number;
  liveAgentCount: number;
}) {
  const { completion_summary: cs } = analytics;
  const totalSessions = analytics.daily_trends.reduce((s, d) => s + d.sessions, 0);
  const toolCount = analytics.tool_distribution.length;

  const delta =
    cs.prev_completion_rate != null
      ? Math.round((cs.completion_rate - cs.prev_completion_rate) * 10) / 10
      : null;

  const sparkData = computeCompletionRates(analytics.daily_trends);

  return (
    <div className={styles.section}>
      <div className={styles.headline}>
        <div className={styles.headlineRate}>
          <div className={styles.headlineNumber}>
            {cs.total_sessions > 0 ? `${cs.completion_rate}` : '--'}
            <span className={styles.headlineUnit}>%</span>
          </div>
          <span className={styles.headlineUnit}>completion rate</span>
          {delta != null && (
            <span
              className={clsx(
                styles.headlineDelta,
                delta > 0 && styles.deltaUp,
                delta < 0 && styles.deltaDown,
                delta === 0 && styles.deltaNeutral,
              )}
            >
              {delta > 0 ? '+' : ''}
              {delta}% from last period
            </span>
          )}
        </div>

        <div className={styles.headlineContext}>
          <div className={styles.contextStat}>
            <span className={styles.contextValue}>{totalSessions}</span>
            <span className={styles.contextLabel}>sessions</span>
          </div>
          <div className={styles.contextStat}>
            <span className={styles.contextValue}>{toolCount}</span>
            <span className={styles.contextLabel}>tools</span>
          </div>
          <div className={styles.contextStat}>
            <span className={styles.contextValue}>{projectCount}</span>
            <span className={styles.contextLabel}>projects</span>
          </div>
          {liveAgentCount > 0 && (
            <div className={styles.contextStat}>
              <span className={styles.contextValue}>{liveAgentCount}</span>
              <span className={styles.contextLabel}>live</span>
            </div>
          )}
        </div>

        {sparkData.length > 1 && (
          <div className={styles.headlineSparkline}>
            <Sparkline data={sparkData} />
          </div>
        )}
      </div>
      {cs.unknown > 0 && (
        <span className={styles.coverageNote}>{cs.unknown} sessions without outcome data</span>
      )}
    </div>
  );
}
