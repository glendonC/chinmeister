import styles from './ProjectView.module.css';

export default function SummaryStat({ label, value }) {
  return (
    <div className={styles.summaryItem}>
      <span className={styles.summaryValue}>{value}</span>
      <span className={styles.summaryLabel}>{label}</span>
    </div>
  );
}
