import type { ReactNode } from 'react';
import clsx from 'clsx';
import styles from './BodyLead.module.css';

export interface BodyLeadProps {
  label: ReactNode;
  value: ReactNode;
  sublabel?: ReactNode;
  tone?: 'neutral' | 'positive' | 'warning';
}

/** Compact callout shared by activity widget bodies: a small uppercase
 *  eyebrow label, a hero value, and an optional sublabel underneath.
 *  Tone toggles the value color for semantic emphasis (positive = success,
 *  warning = warn); neutral leaves the value at --ink. */
export function BodyLead({ label, value, sublabel, tone = 'neutral' }: BodyLeadProps) {
  return (
    <div className={styles.bodyLead}>
      <span className={styles.label}>{label}</span>
      <span className={clsx(styles.value, tone !== 'neutral' && styles[`tone-${tone}`])}>
        {value}
      </span>
      {sublabel != null ? <span className={styles.sublabel}>{sublabel}</span> : null}
    </div>
  );
}
