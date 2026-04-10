import { useMemo, type CSSProperties } from 'react';
import { aggregateModels } from '../overview-utils.js';
import { formatDuration } from '../../../lib/utils.js';
import styles from '../OverviewView.module.css';

export function ModelSection({
  modelOutcomes,
}: {
  modelOutcomes: Array<{
    agent_model: string;
    outcome: string;
    count: number;
    avg_duration_min: number;
    total_edits: number;
    total_lines_added: number;
    total_lines_removed: number;
  }>;
}) {
  const models = useMemo(() => aggregateModels(modelOutcomes), [modelOutcomes]);

  if (models.length < 2) return null;

  return (
    <div className={styles.section}>
      <span className={styles.sectionLabel}>Model performance</span>
      <div className={styles.modelList}>
        {models.map((m, i) => (
          <div
            key={m.model}
            className={styles.modelRow}
            style={{ '--row-index': i } as CSSProperties}
          >
            <span className={styles.modelName}>{m.model}</span>
            <span className={styles.modelStat}>
              <span className={styles.modelStatValue}>{m.rate}%</span> completion
            </span>
            <span className={styles.modelStat}>
              <span className={styles.modelStatValue}>{formatDuration(m.avgMin)}</span> avg
            </span>
            <span className={styles.modelStat}>
              <span className={styles.modelStatValue}>{m.edits.toLocaleString()}</span> edits
            </span>
            <span className={styles.modelStat}>
              <span className={styles.modelStatValue}>
                {(m.linesAdded + m.linesRemoved).toLocaleString()}
              </span>{' '}
              lines
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
