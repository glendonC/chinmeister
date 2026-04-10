import { type CSSProperties } from 'react';
import { getToolMeta } from '../../../lib/toolMeta.js';
import type {
  ConversationEditCorrelation,
  ConversationAnalytics,
} from '../../../lib/apiSchemas.js';
import { WORK_TYPE_COLORS } from '../overview-utils.js';
import styles from '../OverviewView.module.css';

export function ConversationEditSection({ data }: { data: ConversationEditCorrelation[] }) {
  if (data.length === 0) return null;

  const maxSessions = Math.max(...data.map((d) => d.sessions), 1);

  return (
    <div className={styles.section}>
      <span className={styles.sectionLabel}>Conversation depth</span>
      <div className={styles.dataList}>
        {data.map((d, i) => (
          <div
            key={d.bucket}
            className={styles.dataRow}
            style={{ '--row-index': i } as CSSProperties}
          >
            <span className={styles.dataName}>{d.bucket}</span>
            <div className={styles.dataMeta}>
              <span className={styles.dataStat}>
                <span className={styles.dataStatValue}>{d.sessions}</span> sessions
              </span>
              <span className={styles.dataStat}>
                <span className={styles.dataStatValue}>{d.avg_edits}</span> avg edits
              </span>
              <span className={styles.dataStat}>
                <span className={styles.dataStatValue}>{d.avg_lines.toFixed(0)}</span> avg lines
              </span>
              <span className={styles.dataStat}>
                <span className={styles.dataStatValue}>{d.completion_rate}%</span> completed
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Conversation Intelligence Section ────────────

const SENTIMENT_COLORS: Record<string, string> = {
  positive: 'var(--success)',
  neutral: 'var(--soft)',
  frustrated: 'var(--warn)',
  confused: 'var(--warn)',
  negative: 'var(--danger)',
  unclassified: 'var(--ghost)',
};

export function ConversationIntelligenceSection({ conv }: { conv: ConversationAnalytics }) {
  if (conv.total_messages === 0 && conv.sessions_with_conversations === 0) return null;

  const maxSentiment = Math.max(...conv.sentiment_distribution.map((s) => s.count), 1);
  const maxTopic = Math.max(...conv.topic_distribution.map((t) => t.count), 1);

  return (
    <div className={styles.section}>
      <span className={styles.sectionLabel}>Conversation intelligence</span>

      {/* Message volume stats */}
      <div className={styles.statRow}>
        <div className={styles.statBlock}>
          <span className={styles.statBlockValue}>{conv.total_messages.toLocaleString()}</span>
          <span className={styles.statBlockLabel}>messages</span>
        </div>
        <div className={styles.statBlock}>
          <span className={styles.statBlockValue}>{conv.user_messages.toLocaleString()}</span>
          <span className={styles.statBlockLabel}>from you</span>
        </div>
        <div className={styles.statBlock}>
          <span className={styles.statBlockValue}>{conv.avg_user_char_count.toLocaleString()}</span>
          <span className={styles.statBlockLabel}>avg chars / msg</span>
        </div>
        <div className={styles.statBlock}>
          <span className={styles.statBlockValue}>
            {conv.avg_assistant_char_count.toLocaleString()}
          </span>
          <span className={styles.statBlockLabel}>avg assistant chars</span>
        </div>
        <div className={styles.statBlock}>
          <span className={styles.statBlockValue}>{conv.sessions_with_conversations}</span>
          <span className={styles.statBlockLabel}>sessions tracked</span>
        </div>
      </div>

      {/* Sentiment distribution */}
      {conv.sentiment_distribution.length > 0 && (
        <>
          <span className={styles.sectionSublabel}>Your sentiment</span>
          <div className={styles.metricBars}>
            {conv.sentiment_distribution.map((s) => {
              const pct = maxSentiment > 0 ? (s.count / maxSentiment) * 100 : 0;
              return (
                <div key={s.sentiment} className={styles.metricRow}>
                  <span className={styles.metricLabel}>{s.sentiment}</span>
                  <div className={styles.metricBarTrack}>
                    <div
                      className={styles.metricBarFill}
                      style={{
                        width: `${pct}%`,
                        background: SENTIMENT_COLORS[s.sentiment] || 'var(--ghost)',
                      }}
                    />
                  </div>
                  <span className={styles.durationCount}>{s.count}</span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Topic distribution */}
      {conv.topic_distribution.length > 0 && (
        <>
          <span className={styles.sectionSublabel}>What you ask about</span>
          <div className={styles.metricBars}>
            {conv.topic_distribution.slice(0, 8).map((t) => {
              const pct = maxTopic > 0 ? (t.count / maxTopic) * 100 : 0;
              return (
                <div key={t.topic} className={styles.metricRow}>
                  <span className={styles.metricLabel}>{t.topic}</span>
                  <div className={styles.metricBarTrack}>
                    <div className={styles.metricBarFill} style={{ width: `${pct}%` }} />
                  </div>
                  <span className={styles.durationCount}>{t.count}</span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Sentiment-outcome correlation */}
      {conv.sentiment_outcome_correlation.length > 0 && (
        <>
          <span className={styles.sectionSublabel}>Sentiment → outcome</span>
          <div className={styles.dataList}>
            {conv.sentiment_outcome_correlation.map((sc, i) => (
              <div
                key={sc.dominant_sentiment}
                className={styles.dataRow}
                style={{ '--row-index': i } as CSSProperties}
              >
                <span className={styles.dataName}>{sc.dominant_sentiment}</span>
                <div className={styles.dataMeta}>
                  <span className={styles.dataStat}>
                    <span className={styles.dataStatValue}>{sc.sessions}</span> sessions
                  </span>
                  <span className={styles.dataStat}>
                    <span className={styles.dataStatSuccess}>{sc.completion_rate}%</span> completed
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Tool coverage */}
      {conv.tool_coverage.unsupported_tools.length > 0 && (
        <div className={styles.coverageNote}>
          Conversation data from{' '}
          {conv.tool_coverage.supported_tools.length > 0
            ? conv.tool_coverage.supported_tools.map((t) => getToolMeta(t).label).join(', ')
            : 'managed agents'}
          . {conv.tool_coverage.unsupported_tools.map((t) => getToolMeta(t).label).join(', ')} —
          session data only.
        </div>
      )}
    </div>
  );
}
