import styles from './StatCard.module.css';

export default function StatCard({ value, label, variant = 'default' }) {
  const cls = [
    styles.statCard,
    variant === 'active' ? styles.active : '',
    variant === 'danger' ? styles.danger : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={cls} role="group" aria-label={`${value} ${label}`}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}
