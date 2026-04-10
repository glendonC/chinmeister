import { type CSSProperties } from 'react';
import type {
  MemoryUsageStats,
  MemoryOutcomeCorrelation,
  MemoryAccessEntry,
} from '../../../lib/apiSchemas.js';
import styles from '../OverviewView.module.css';

export function MemoryUsageSection({ usage }: { usage: MemoryUsageStats }) {
  if (usage.total_memories === 0 && usage.searches === 0) return null;

  return (
    <div className={styles.section}>
      <span className={styles.sectionLabel}>Memory health</span>
      <div className={styles.statRow}>
        <div className={styles.statBlock}>
          <span className={styles.statBlockValue}>{usage.total_memories}</span>
          <span className={styles.statBlockLabel}>total memories</span>
        </div>
        <div className={styles.statBlock}>
          <span className={styles.statBlockValue}>{usage.search_hit_rate}%</span>
          <span className={styles.statBlockLabel}>search hit rate</span>
        </div>
        <div className={styles.statBlock}>
          <span className={styles.statBlockValue}>{usage.searches}</span>
          <span className={styles.statBlockLabel}>searches</span>
        </div>
        <div className={styles.statBlock}>
          <span className={styles.statBlockValue}>{usage.memories_created_period}</span>
          <span className={styles.statBlockLabel}>created this period</span>
        </div>
        <div className={styles.statBlock}>
          <span className={styles.statBlockValue}>{usage.memories_updated_period}</span>
          <span className={styles.statBlockLabel}>updated this period</span>
        </div>
        <div className={styles.statBlock}>
          <span className={styles.statBlockValue}>{usage.stale_memories}</span>
          <span className={styles.statBlockLabel}>stale (30d+)</span>
        </div>
        <div className={styles.statBlock}>
          <span className={styles.statBlockValue}>{Math.round(usage.avg_memory_age_days)}d</span>
          <span className={styles.statBlockLabel}>avg age</span>
        </div>
      </div>
    </div>
  );
}

export function MemoryOutcomeSection({ data }: { data: MemoryOutcomeCorrelation[] }) {
  if (data.length === 0) return null;

  return (
    <div className={styles.section}>
      <span className={styles.sectionLabel}>Memory impact</span>
      <div className={styles.compareRow}>
        {data.map((d) => (
          <div key={d.bucket} className={styles.compareBlock}>
            <span className={styles.compareValue}>{d.completion_rate}%</span>
            <span className={styles.compareLabel}>
              {d.bucket} ({d.sessions})
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function TopMemoriesSection({ memories }: { memories: MemoryAccessEntry[] }) {
  if (memories.length === 0) return null;

  return (
    <div className={styles.section}>
      <span className={styles.sectionLabel}>Most accessed memories</span>
      <div className={styles.dataList}>
        {memories.slice(0, 10).map((m, i) => (
          <div key={m.id} className={styles.dataRow} style={{ '--row-index': i } as CSSProperties}>
            <span className={styles.memoryPreview}>{m.text_preview}</span>
            <div className={styles.dataMeta}>
              <span className={styles.dataStat}>
                <span className={styles.dataStatValue}>{m.access_count}</span> hits
              </span>
              {m.last_accessed_at && (
                <span className={styles.dataStat}>{formatRelativeTime(m.last_accessed_at)}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
