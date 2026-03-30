import ToolIcon from '../../components/ToolIcon/ToolIcon.jsx';
import EmptyState from '../../components/EmptyState/EmptyState.jsx';
import { formatShare } from '../../lib/toolAnalytics.js';
import { getToolMeta } from '../../lib/toolMeta.js';
import SummaryStat from './SummaryStat.jsx';
import styles from './ProjectView.module.css';

export default function ProjectToolsTab({
  toolSummaries,
  conflicts,
  filesInPlay,
  locks,
  usageEntries,
}) {
  const hasUsage = usageEntries.length > 0;

  if (toolSummaries.length === 0) {
    return <EmptyState title="No tools configured" hint="Run npx chinwag init in this repo." />;
  }

  return (
    <div className={styles.panelGrid}>
      <section className={styles.block}>
        <div className={styles.blockHeader}>
          <h2 className={styles.blockTitle}>Tool usage</h2>
          <span className={styles.blockMeta}>Recorded joins</span>
        </div>
        <div className={styles.distributionList}>
          {toolSummaries.map((tool) => (
            <div key={tool.tool} className={styles.distributionRow}>
              <div className={styles.distributionCopy}>
                <span className={styles.distributionLabel}>
                  <ToolIcon tool={tool.tool} size={16} />
                  <span>{getToolMeta(tool.tool).label}</span>
                </span>
                <span className={styles.distributionMeta}>
                  {tool.live} live · {tool.joins} joins
                </span>
              </div>
              <span className={styles.distributionValue}>
                {tool.joins > 0 ? formatShare(tool.share) : '\u2014'}
              </span>
            </div>
          ))}
        </div>
      </section>

      <div className={styles.asideStack}>
        <section className={styles.block}>
          <div className={styles.blockHeader}>
            <h2 className={styles.blockTitle}>Coordination</h2>
            <span className={styles.blockMeta}>Current + recorded</span>
          </div>

          <div className={styles.summaryGrid}>
            <SummaryStat label="overlapping files now" value={conflicts.length} />
            <SummaryStat label="files in play now" value={filesInPlay.length} />
            <SummaryStat label="locks held now" value={locks.length} />
          </div>

          {hasUsage && (
            <div className={styles.distributionList}>
              {usageEntries.map((entry) => (
                <div key={entry.id} className={styles.distributionRow}>
                  <div className={styles.distributionCopy}>
                    <span className={styles.simpleLabel}>{entry.label}</span>
                    <span className={styles.distributionMeta}>lifetime counter</span>
                  </div>
                  <span className={styles.distributionValue}>{entry.value}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
