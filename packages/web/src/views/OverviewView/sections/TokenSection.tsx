import type { CSSProperties } from 'react';
import { formatTokens } from '../overview-utils.js';
import { getToolMeta } from '../../../lib/toolMeta.js';
import type { TokenUsageStats, DataCoverage } from '../../../lib/apiSchemas.js';
import styles from '../OverviewView.module.css';

export function TokenUsageSection({ usage }: { usage: TokenUsageStats }) {
  if (usage.sessions_with_token_data === 0) return null;

  const totalTokens = usage.total_input_tokens + usage.total_output_tokens;
  const coverage = Math.round(
    (usage.sessions_with_token_data /
      (usage.sessions_with_token_data + usage.sessions_without_token_data)) *
      100,
  );
  const costPerSession =
    usage.total_estimated_cost_usd > 0 && usage.sessions_with_token_data > 0
      ? usage.total_estimated_cost_usd / usage.sessions_with_token_data
      : 0;

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
            <span className={styles.statBlockLabel}>estimated total</span>
          </div>
        )}
        {costPerSession > 0 && (
          <div className={styles.statBlock}>
            <span className={styles.statBlockValue}>${costPerSession.toFixed(3)}</span>
            <span className={styles.statBlockLabel}>per session</span>
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
      {usage.by_tool.length > 1 && (
        <>
          <span className={styles.sectionSublabel}>By tool</span>
          <div className={styles.modelList}>
            {usage.by_tool.map((t, i) => {
              const meta = getToolMeta(t.host_tool);
              return (
                <div
                  key={t.host_tool}
                  className={styles.modelRow}
                  style={{ '--row-index': i } as CSSProperties}
                >
                  <span className={styles.modelName}>{meta.label}</span>
                  <span className={styles.modelStat}>
                    <span className={styles.modelStatValue}>{formatTokens(t.input_tokens)}</span>{' '}
                    input
                  </span>
                  <span className={styles.modelStat}>
                    <span className={styles.modelStatValue}>{formatTokens(t.output_tokens)}</span>{' '}
                    output
                  </span>
                  <span className={styles.modelStat}>
                    <span className={styles.modelStatValue}>{t.sessions}</span> sessions
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export function DataCoverageSection({ coverage }: { coverage?: DataCoverage }) {
  if (!coverage || coverage.tools_reporting.length === 0) return null;

  return (
    <div className={styles.section}>
      <span className={styles.sectionLabel}>Data coverage</span>
      <div className={styles.statRow}>
        <div className={styles.statBlock}>
          <span className={styles.statBlockValue}>{Math.round(coverage.coverage_rate * 100)}%</span>
          <span className={styles.statBlockLabel}>tool coverage</span>
        </div>
        <div className={styles.statBlock}>
          <span className={styles.statBlockValue}>{coverage.tools_reporting.length}</span>
          <span className={styles.statBlockLabel}>tools reporting</span>
        </div>
        {coverage.tools_without_data.length > 0 && (
          <div className={styles.statBlock}>
            <span className={styles.statBlockValue}>{coverage.tools_without_data.length}</span>
            <span className={styles.statBlockLabel}>without data</span>
          </div>
        )}
      </div>
      {coverage.capabilities_missing.length > 0 && (
        <div className={styles.coverageNote}>
          Missing capabilities: {coverage.capabilities_missing.join(', ')}
        </div>
      )}
    </div>
  );
}
