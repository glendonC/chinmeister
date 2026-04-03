import type { Lock } from '../../lib/apiSchemas.js';
import { formatDuration } from '../../lib/utils.js';
import ToolIcon from '../ToolIcon/ToolIcon.jsx';
import styles from './LockRow.module.css';

interface Props {
  lock: Lock;
}

export default function LockRow({ lock }: Props) {
  const owner = lock.handle;
  const duration = lock.minutes_held != null ? formatDuration(lock.minutes_held) : '';

  return (
    <div className={styles.lockRow}>
      <span className={styles.lockFile}>{lock.file_path}</span>
      <span className={styles.lockOwner}>
        {lock.host_tool && lock.host_tool !== 'unknown' ? (
          <ToolIcon tool={lock.host_tool} size={15} monochrome={true} />
        ) : null}
        <span>{owner}</span>
      </span>
      {duration && <span className={styles.lockTime}>{duration}</span>}
    </div>
  );
}
