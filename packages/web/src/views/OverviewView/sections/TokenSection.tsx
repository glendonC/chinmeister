import type { CSSProperties } from 'react';
import { formatTokens } from '../overview-utils.js';
import type { TokenUsageStats } from '../../../lib/apiSchemas.js';
import styles from '../OverviewView.module.css';

export function TokenUsageSection({ usage }: { usage: TokenUsageStats }) {
  if (usage.sessions_with_token_data === 0) return null;

  const totalTokens = usage.total_input_tokens + usage.total_output_tokens;
  const coverage = Math.round(
    (usage.sessions_with_token_data /
      (usage.sessions_with_token_data + usage.sessions_without_token_data)) *
      100,
  );

  return (
    <div className={styles.section}>
      <span className={styles.sectionLabel}>Token usage</span>
      <div className={styles.statRow}>
        <div className={styles.statBlock}>
          <span className={styles.statBlockValue}>{formatTokens(totalTokens)}</span>
          <span className={styles.statBlockLabel}>total tokens</span>
        </div>
        <div className={styles.statBlock}>
          <span className={styles.statBlockValue}>{formatTokens(usage.avg_input_per_session)}</span>
          <span className={styles.statBlockLabel}>avg input / session</span>
        </div>
        <div className={styles.statBlock}>
          <span className={styles.statBlockValue}>
            {formatTokens(usage.avg_output_per_session)}
          </span>
          <span className={styles.statBlockLabel}>avg output / session</span>
        </div>
        <div className={styles.statBlock}>
          <span className={styles.statBlockValue}>{coverage}%</span>
          <span className={styles.statBlockLabel}>session coverage</span>
        </div>
        {usage.total_estimated_cost_usd > 0 && (
          <div className={styles.statBlock}>
            <span className={styles.statBlockValue}>
              ${usage.total_estimated_cost_usd.toFixed(2)}
            </span>
            <span className={styles.statBlockLabel}>estimated</span>
          </div>
        )}
      </div>
      {usage.by_model.length > 1 && (
        <div className={styles.modelList}>
          {usage.by_model.map((m, i) => (
            <div
              key={m.agent_model}
              className={styles.modelRow}
              style={{ '--row-index': i } as CSSProperties}
            >
              <span className={styles.modelName}>{m.agent_model}</span>
              <span className={styles.modelStat}>
                <span className={styles.modelStatValue}>{formatTokens(m.input_tokens)}</span> input
              </span>
              <span className={styles.modelStat}>
                <span className={styles.modelStatValue}>{formatTokens(m.output_tokens)}</span>{' '}
                output
              </span>
              <span className={styles.modelStat}>
                <span className={styles.modelStatValue}>{m.sessions}</span> sessions
              </span>
              {m.estimated_cost_usd != null && m.estimated_cost_usd > 0 && (
                <span className={styles.modelStat}>
                  <span className={styles.modelStatValue}>${m.estimated_cost_usd.toFixed(2)}</span>{' '}
                  cost
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
