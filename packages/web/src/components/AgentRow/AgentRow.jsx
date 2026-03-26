import { formatDuration } from '../../lib/utils.js';
import styles from './AgentRow.module.css';

export default function AgentRow({ agent }) {
  const isActive = agent.status === 'active';
  const tool = agent.tool && agent.tool !== 'unknown' ? agent.tool : null;
  const files = agent.activity?.files || [];
  const summary = agent.activity?.summary || '';
  const duration = formatDuration(agent.session_minutes);

  // Tool name is the primary identity, not the username
  const label = tool || agent.handle;

  // Show first 2 file basenames
  const fileDisplay = files.length > 0
    ? files.slice(0, 2).map(f => f.split('/').pop()).join(', ') + (files.length > 2 ? ` +${files.length - 2}` : '')
    : null;

  // Filter out useless summaries
  const showSummary = summary && !/^editing\s/i.test(summary);

  return (
    <div className={`${styles.row} ${isActive ? '' : styles.offline}`}>
      <span className={`${styles.dot} ${isActive ? styles.dotOn : styles.dotOff}`} />
      <div className={styles.info}>
        <span className={styles.tool}>{label}</span>
        {fileDisplay && <span className={styles.files}>{fileDisplay}</span>}
        {showSummary && !fileDisplay && <span className={styles.summary}>{summary}</span>}
      </div>
      {duration && <span className={styles.time}>{duration}</span>}
    </div>
  );
}
