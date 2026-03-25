import { formatDuration } from '../../lib/utils.js';
import styles from './SessionRow.module.css';

export default function SessionRow({ session }) {
  const duration = formatDuration(session.duration_minutes);
  const isLive = !session.ended_at;
  const fileCount = session.files_touched?.length || 0;

  return (
    <div className={styles.sessionRow}>
      <span className={styles.sessionHandle}>{session.owner_handle}</span>
      {session.framework && <span className={styles.sessionTool}>{session.framework}</span>}
      {isLive && <span className={styles.sessionLive}>live</span>}
      <span className={styles.sessionMeta}>
        {duration} &middot; {session.edit_count} edits &middot; {fileCount} files
      </span>
    </div>
  );
}
