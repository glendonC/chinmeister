import type { ReactNode } from 'react';
import styles from './EmptyState.module.css';

interface Props {
  title: string;
  hint?: ReactNode;
  large?: boolean;
}

export default function EmptyState({ title, hint = '', large = false }: Props) {
  const cls = [styles.emptyState, large ? styles.large : ''].filter(Boolean).join(' ');

  return (
    <div className={cls} role="status">
      <p className={styles.emptyTitle}>{title}</p>
      {hint && <p className={styles.emptyHint}>{hint}</p>}
    </div>
  );
}
