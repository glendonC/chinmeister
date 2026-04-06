import type { Session } from '../../lib/apiSchemas.js';
import { formatDuration } from '../../lib/utils.js';
import ToolIcon from '../ToolIcon/ToolIcon.jsx';
import styles from './SessionRow.module.css';

interface Props {
  session: Session;
}

const OUTCOME_SYMBOLS: Record<string, string> = {
  completed: '\u2713',
  abandoned: '\u25cb',
  failed: '\u2717',
};

export default function SessionRow({ session }: Props) {
  const duration = formatDuration(session.duration_minutes);
  const isLive = !session.ended_at;
  const editCount = session.edit_count || 0;
  const fileCount = session.files_touched?.length || 0;
  const linesAdded = session.lines_added || 0;
  const linesRemoved = session.lines_removed || 0;
  const ownerLabel = session.owner_handle || session.handle || 'Agent';
  const tool =
    session.framework && session.framework !== 'unknown'
      ? session.framework
      : session.host_tool || null;
  const toolIcon = session.host_tool && session.host_tool !== 'unknown' ? session.host_tool : null;
  const outcome = session.outcome;
  const outcomeSymbol = outcome ? OUTCOME_SYMBOLS[outcome] || null : null;

  const parts = [tool || 'agent', duration];
  if (editCount > 0) parts.push(`${editCount} edits`);
  if (linesAdded > 0 || linesRemoved > 0) {
    const diffParts: string[] = [];
    if (linesAdded > 0) diffParts.push(`+${linesAdded}`);
    if (linesRemoved > 0) diffParts.push(`\u2212${linesRemoved}`);
    parts.push(diffParts.join('/'));
  }
  if (fileCount > 0) parts.push(`${fileCount} files`);

  return (
    <div className={styles.row}>
      <div className={styles.identity}>
        {toolIcon ? <ToolIcon tool={toolIcon} size={16} monochrome={true} /> : null}
        <span className={styles.tool}>{ownerLabel}</span>
      </div>
      {isLive && <span className={styles.live}>live</span>}
      {!isLive && outcomeSymbol && (
        <span className={`${styles.outcome} ${outcome ? styles[outcome] : ''}`}>
          {outcomeSymbol}
        </span>
      )}
      <span className={styles.meta}>{parts.join(' \u00b7 ')}</span>
    </div>
  );
}
