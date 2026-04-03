import type { ReactNode } from 'react';
import styles from './StatCard.module.css';

interface Props {
  value: ReactNode;
  label: string;
  hint?: string;
  tone?: 'default' | 'accent' | 'danger' | 'success';
}

export default function StatCard({ value, label, hint = '', tone = 'default' }: Props) {
  const cls = [
    styles.stat,
    tone === 'accent' ? styles.accent : '',
    tone === 'danger' ? styles.danger : '',
    tone === 'success' ? styles.success : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cls} role="group" aria-label={`${value} ${label}`}>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statValue}>{value}</span>
      {hint ? <span className={styles.statHint}>{hint}</span> : null}
    </div>
  );
}
