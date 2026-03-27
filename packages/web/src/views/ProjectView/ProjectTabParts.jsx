import ConflictBanner from '../../components/ConflictBanner/ConflictBanner.jsx';
import AgentRow from '../../components/AgentRow/AgentRow.jsx';
import MemoryRow from '../../components/MemoryRow/MemoryRow.jsx';
import SessionRow from '../../components/SessionRow/SessionRow.jsx';
import LockRow from '../../components/LockRow/LockRow.jsx';
import MessageRow from '../../components/MessageRow/MessageRow.jsx';
import MessageComposer from '../../components/MessageComposer/MessageComposer.jsx';
import EmptyState from '../../components/EmptyState/EmptyState.jsx';
import ToolIcon from '../../components/ToolIcon/ToolIcon.jsx';
import { formatShare } from '../../lib/toolAnalytics.js';
import { getToolMeta } from '../../lib/toolMeta.js';
import styles from './ProjectView.module.css';

export function ProjectLiveTab({
  sortedAgents,
  offlineAgents,
  conflicts,
  filesInPlay,
  locks,
  liveToolMix,
}) {
  return (
    <div className={styles.panelGrid}>
      <section className={styles.block}>
        <div className={styles.blockHeader}>
          <h2 className={styles.blockTitle}>Agents</h2>
          {offlineAgents.length > 0 ? (
            <span className={styles.blockMeta}>{offlineAgents.length} offline</span>
          ) : null}
        </div>

        {sortedAgents.length > 0 ? (
          <div className={styles.sectionBody}>
            {sortedAgents.map((agent) => (
              <AgentRow
                key={agent.agent_id || `${agent.handle}:${agent.tool}:${agent.status}`}
                agent={agent}
              />
            ))}
          </div>
        ) : (
          <EmptyState title="No agents connected" hint="Open a connected tool in this repo." />
        )}
      </section>

      <div className={styles.asideStack}>
        <section className={styles.block}>
          <div className={styles.blockHeader}>
            <h2 className={styles.blockTitle}>Work in play</h2>
            <span className={styles.blockMeta}>{filesInPlay.length} files</span>
          </div>

          {conflicts.length > 0 ? <ConflictBanner conflicts={conflicts} /> : null}

          {filesInPlay.length > 0 ? (
            <div className={styles.pathList}>
              {filesInPlay.map((file) => (
                <span key={file} className={styles.pathRow}>
                  {file}
                </span>
              ))}
            </div>
          ) : (
            <p className={styles.emptyHint}>No files in play.</p>
          )}

          {locks.length > 0 ? (
            <div className={styles.lockList}>
              {locks.map((lock, index) => (
                <LockRow
                  key={lock.file_path || `${lock.owner_handle || 'lock'}:${index}`}
                  lock={lock}
                />
              ))}
            </div>
          ) : (
            <p className={styles.emptyHint}>No file locks.</p>
          )}
        </section>

        <section className={styles.block}>
          <div className={styles.blockHeader}>
            <h2 className={styles.blockTitle}>Live tools</h2>
            <span className={styles.blockMeta}>Active agents</span>
          </div>

          {liveToolMix.length > 0 ? (
            <div className={styles.distributionList}>
              {liveToolMix.map((tool) => (
                <div key={tool.tool} className={styles.distributionRow}>
                  <div className={styles.distributionCopy}>
                    <span className={styles.distributionLabel}>
                      <ToolIcon tool={tool.tool} size={16} />
                      <span>{getToolMeta(tool.tool).label}</span>
                    </span>
                    <span className={styles.distributionMeta}>{tool.value} live</span>
                  </div>
                  <span className={styles.distributionValue}>{formatShare(tool.share)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.emptyHint}>No live tool activity.</p>
          )}
        </section>
      </div>
    </div>
  );
}

export function ProjectMemoryTab({
  memories,
  memoryBreakdown,
  messages,
  onUpdateMemory,
  onDeleteMemory,
  onSendMessage,
}) {
  return (
    <div className={styles.panelGrid}>
      <section className={styles.block}>
        <div className={styles.blockHeader}>
          <h2 className={styles.blockTitle}>Saved memory</h2>
          <span className={styles.blockMeta}>{memories.length}</span>
        </div>

        {memories.length > 0 ? (
          <div className={styles.sectionBody}>
            {memories.map((memory) => (
              <MemoryRow
                key={memory.id}
                memory={memory}
                onUpdate={onUpdateMemory}
                onDelete={onDeleteMemory}
              />
            ))}
          </div>
        ) : (
          <EmptyState title="No memory saved" hint="Saved memories appear here." />
        )}
      </section>

      <div className={styles.asideStack}>
        <section className={styles.block}>
          <div className={styles.blockHeader}>
            <h2 className={styles.blockTitle}>Recent tags</h2>
            {memoryBreakdown.length > 0 ? <span className={styles.blockMeta}>Sample</span> : null}
          </div>

          {memoryBreakdown.length > 0 ? (
            <div className={styles.distributionList}>
              {memoryBreakdown.map(([tag, count]) => (
                <div key={tag} className={styles.distributionRow}>
                  <div className={styles.distributionCopy}>
                    <span className={styles.simpleLabel}>{tag}</span>
                    <span className={styles.distributionMeta}>recent memory</span>
                  </div>
                  <span className={styles.distributionValue}>{count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.emptyHint}>No tags yet.</p>
          )}
        </section>

        <section className={styles.block}>
          <div className={styles.blockHeader}>
            <h2 className={styles.blockTitle}>Messages</h2>
            {messages.length > 0 ? <span className={styles.blockMeta}>{messages.length}</span> : null}
          </div>

          <MessageComposer onSend={onSendMessage} />

          {messages.length > 0 ? (
            <div className={styles.sectionBody}>
              {messages.map((message, index) => (
                <MessageRow
                  key={message.id || `${message.from_handle}:${message.created_at || index}:${message.text}`}
                  message={message}
                />
              ))}
            </div>
          ) : (
            <p className={styles.emptyHint}>No messages yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}

export function ProjectSessionsTab({
  sessions,
  sessionEditCount,
  filesTouched,
  filesTouchedCount,
  liveSessionCount,
}) {
  return (
    <div className={styles.panelGrid}>
      <section className={styles.block}>
        <div className={styles.blockHeader}>
          <h2 className={styles.blockTitle}>Recent sessions</h2>
        </div>

        {sessions.length > 0 ? (
          <div className={styles.sectionBody}>
            {sessions.map((session, index) => (
              <SessionRow
                key={session.session_id || `${session.owner_handle}:${session.started_at || index}`}
                session={session}
              />
            ))}
          </div>
        ) : (
          <EmptyState title="No recent sessions" hint="Reported sessions appear here." />
        )}
      </section>

      <div className={styles.asideStack}>
        <section className={styles.block}>
          <div className={styles.blockHeader}>
            <h2 className={styles.blockTitle}>24h totals</h2>
          </div>

          <div className={styles.summaryGrid}>
            <SummaryStat label="edits reported" value={sessionEditCount} />
            <SummaryStat label="files touched" value={filesTouchedCount} />
            <SummaryStat label="sessions still live" value={liveSessionCount} />
          </div>
        </section>

        <section className={styles.block}>
          <div className={styles.blockHeader}>
            <h2 className={styles.blockTitle}>Files touched</h2>
            {filesTouched.length > 0 ? <span className={styles.blockMeta}>{filesTouched.length}</span> : null}
          </div>

          {filesTouched.length > 0 ? (
            <div className={styles.pathList}>
              {filesTouched.map((file) => (
                <span key={`history:${file}`} className={styles.pathRow}>
                  {file}
                </span>
              ))}
            </div>
          ) : (
            <p className={styles.emptyHint}>No files touched in recent sessions.</p>
          )}
        </section>
      </div>
    </div>
  );
}

export function ProjectToolsTab({
  toolSummaries,
  conflicts,
  filesInPlay,
  locks,
  usageEntries,
}) {
  return (
    <div className={styles.panelGrid}>
      <section className={styles.block}>
        <div className={styles.blockHeader}>
          <h2 className={styles.blockTitle}>Tool usage</h2>
          <span className={styles.blockMeta}>Recorded joins</span>
        </div>

        {toolSummaries.length > 0 ? (
          <div className={styles.distributionList}>
            {toolSummaries.map((tool) => (
              <div key={tool.tool} className={styles.distributionRow}>
                <div className={styles.distributionCopy}>
                  <span className={styles.distributionLabel}>
                    <ToolIcon tool={tool.tool} size={16} />
                    <span>{getToolMeta(tool.tool).label}</span>
                  </span>
                  <span className={styles.distributionMeta}>
                    {tool.live} live · {tool.joins} joins
                  </span>
                </div>
                <span className={styles.distributionValue}>
                  {tool.joins > 0 ? formatShare(tool.share) : '\u2014'}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No tools configured" hint="Run npx chinwag init in this repo." />
        )}
      </section>

      <div className={styles.asideStack}>
        <section className={styles.block}>
          <div className={styles.blockHeader}>
            <h2 className={styles.blockTitle}>Coordination</h2>
            <span className={styles.blockMeta}>Current + recorded</span>
          </div>

          <div className={styles.summaryGrid}>
            <SummaryStat label="overlapping files now" value={conflicts.length} />
            <SummaryStat label="files in play now" value={filesInPlay.length} />
            <SummaryStat label="locks held now" value={locks.length} />
          </div>

          {usageEntries.length > 0 ? (
            <div className={styles.distributionList}>
              {usageEntries.map((entry) => (
                <div key={entry.id} className={styles.distributionRow}>
                  <div className={styles.distributionCopy}>
                    <span className={styles.simpleLabel}>{entry.label}</span>
                    <span className={styles.distributionMeta}>lifetime counter</span>
                  </div>
                  <span className={styles.distributionValue}>{entry.value}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.emptyHint}>No recorded events yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function SummaryStat({ label, value }) {
  return (
    <div className={styles.summaryItem}>
      <span className={styles.summaryValue}>{value}</span>
      <span className={styles.summaryLabel}>{label}</span>
    </div>
  );
}
