import { formatDuration } from '../../lib/utils.js';
import styles from './LockRow.module.css';

export default function LockRow({ lock }) {
  const owner =
    lock.tool && lock.tool !== 'unknown'
      ? `${lock.owner_handle} (${lock.tool})`
      : lock.owner_handle;
  const duration =
    lock.minutes_held != null ? formatDuration(lock.minutes_held) : '';

  return (
    <div className={styles.lockRow}>
      <span className={styles.lockFile}>{lock.file_path}</span>
      <span className={styles.lockOwner}>{owner}</span>
      {duration && <span className={styles.lockTime}>{duration}</span>}
    </div>
  );
}
