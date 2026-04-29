import { type ReactNode } from 'react';

import styles from '../GlobalView.module.css';

export function SectionHead({ label }: { label: string }): ReactNode {
  return (
    <div className={styles.sectionHeader}>
      <span className={styles.sectionLabel}>{label}</span>
      <span className={styles.sectionRule} />
    </div>
  );
}
