import styles from '../OverviewView.module.css';

export const SENTIMENT_COLORS: Record<string, string> = {
  positive: 'var(--success)',
  neutral: 'var(--soft)',
  frustrated: 'var(--warn)',
  confused: 'var(--warn)',
  negative: 'var(--danger)',
  unclassified: 'var(--ghost)',
};

export function StatWidget({ value }: { value: string }) {
  return <span className={styles.heroStatValue}>{value}</span>;
}

export function GhostStatRow({ labels }: { labels: string[] }) {
  return (
    <div className={styles.ghostStatRow}>
      {labels.map((l) => (
        <div key={l} className={styles.statBlock}>
          <span className={styles.ghostStatValue}>—</span>
          <span className={styles.statBlockLabel}>{l}</span>
        </div>
      ))}
    </div>
  );
}

export function GhostBars({ count }: { count: number }) {
  return (
    <div className={styles.metricBars}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={styles.ghostRow}>
          <span className={styles.ghostLabel}>—</span>
          <div className={styles.ghostBarTrack} />
          <span className={styles.ghostValue}>—</span>
        </div>
      ))}
    </div>
  );
}

export function GhostRows({ count }: { count: number }) {
  return (
    <div className={styles.dataList}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={styles.ghostRow}>
          <span className={styles.ghostLabel} style={{ width: 'auto' }}>
            —
          </span>
          <span className={styles.ghostValue}>—</span>
        </div>
      ))}
    </div>
  );
}

export function GhostSparkline() {
  return (
    <svg
      width="100%"
      height={80}
      viewBox="0 0 300 80"
      preserveAspectRatio="none"
      className={styles.trendSvg}
    >
      <line x1="0" y1="40" x2="300" y2="40" stroke="var(--ghost)" strokeWidth="1.5" opacity="0.3" />
    </svg>
  );
}

/**
 * Inline coverage note for deep-capture widgets.
 * Extends the PricingAttribution pattern (muted, one-line).
 * Only shown when data is partial (some tools report, others don't).
 */
export function CoverageNote({ text }: { text: string | null }) {
  if (!text) return null;
  return <div className={styles.coverageNote}>{text}</div>;
}

export function DeltaStat({
  label,
  current,
  prev,
  suffix,
  invert,
}: {
  label: string;
  current: number;
  prev: number;
  suffix: string;
  invert?: boolean;
}) {
  const d = current - prev;
  const isGood = invert ? d < 0 : d > 0;
  const arrow = d > 0 ? '↑' : d < 0 ? '↓' : '→';
  const color = d === 0 ? 'var(--muted)' : isGood ? 'var(--success)' : 'var(--danger)';
  return (
    <div className={styles.statBlock}>
      <span className={styles.statBlockValue}>
        {typeof current === 'number' && current % 1 !== 0 ? current.toFixed(1) : current}
        {suffix}
        <span style={{ color, marginLeft: 6, fontSize: 'var(--text-2xs)' }}>
          {arrow}
          {Math.abs(d) % 1 !== 0 ? Math.abs(d).toFixed(1) : Math.abs(d)}
        </span>
      </span>
      <span className={styles.statBlockLabel}>{label}</span>
    </div>
  );
}
