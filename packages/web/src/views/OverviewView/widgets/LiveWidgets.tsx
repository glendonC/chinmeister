import { getToolMeta } from '../../../lib/toolMeta.js';
import { formatDuration } from '../../../lib/utils.js';
import styles from '../OverviewView.module.css';
import type { WidgetBodyProps, WidgetRegistry } from './types.js';

function LiveAgentsWidget({ liveAgents, selectTeam }: WidgetBodyProps) {
  if (liveAgents.length === 0) {
    return <span className={styles.sectionEmpty}>No one working right now</span>;
  }
  return (
    <div className={styles.liveBar}>
      {liveAgents.map((a, i) => {
        const meta = getToolMeta(a.host_tool);
        return (
          <button
            key={`${a.handle}-${i}`}
            className={styles.liveAgent}
            onClick={() => selectTeam(a.teamId)}
            type="button"
          >
            <span className={styles.liveDot} style={{ background: meta.color }} />
            <span className={styles.liveHandle}>{a.handle}</span>
            <span className={styles.liveMeta}>{meta.label}</span>
            {a.session_minutes != null && a.session_minutes > 0 && (
              <span className={styles.liveDuration}>{formatDuration(a.session_minutes)}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export const liveWidgets: WidgetRegistry = {
  'live-agents': LiveAgentsWidget,
};
