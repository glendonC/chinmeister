import { formatDuration } from '../../lib/utils.js';
import styles from './AgentRow.module.css';

export default function AgentRow({ agent }) {
  const isActive = agent.status === 'active';
  const toolLabel = agent.tool && agent.tool !== 'unknown' ? agent.tool : agent.framework || '';
  const files = agent.activity?.files?.join(', ') || '';
  const duration = formatDuration(agent.session_minutes);

  return (
    <div className={styles.agentRow}>
      <span className={`${styles.agentDot} ${isActive ? styles.dotActive : styles.dotOffline}`} />
      <div className={styles.agentInfo}>
        <span className={styles.agentName}>{agent.handle}</span>
        {toolLabel && <span className={styles.agentTool}>{toolLabel}</span>}
      </div>
      <div className={styles.agentMeta}>
        {files && <span className={styles.agentFiles} title={files}>{files}</span>}
        {duration && <span className={styles.agentTime}>{duration}</span>}
      </div>
    </div>
  );
}
