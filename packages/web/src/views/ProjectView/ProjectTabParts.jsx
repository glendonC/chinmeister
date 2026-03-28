import { useState, useMemo } from 'react';
import ConflictBanner from '../../components/ConflictBanner/ConflictBanner.jsx';
import AgentRow from '../../components/AgentRow/AgentRow.jsx';
import MemoryRow from '../../components/MemoryRow/MemoryRow.jsx';
import SessionRow from '../../components/SessionRow/SessionRow.jsx';
import LockRow from '../../components/LockRow/LockRow.jsx';
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
  const hasAgents = sortedAgents.length > 0;
  const hasFiles = filesInPlay.length > 0;
  const hasLocks = locks.length > 0;
  const hasToolMix = liveToolMix.length > 0;
  const hasAside = hasFiles || hasLocks || conflicts.length > 0 || hasToolMix;

  if (!hasAgents && !hasAside) {
    return <EmptyState title="No agents connected" hint="Open a connected tool in this repo." />;
  }

  return (
    <div className={hasAside ? styles.panelGrid : undefined}>
      <section className={styles.block}>
        <div className={styles.blockHeader}>
          <h2 className={styles.blockTitle}>Agents</h2>
          {offlineAgents.length > 0 ? (
            <span className={styles.blockMeta}>{offlineAgents.length} offline</span>
          ) : null}
        </div>

        {hasAgents ? (
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

      {hasAside && (
        <div className={styles.asideStack}>
          {(hasFiles || hasLocks || conflicts.length > 0) && (
            <section className={styles.block}>
              <div className={styles.blockHeader}>
                <h2 className={styles.blockTitle}>Work in play</h2>
                <span className={styles.blockMeta}>{filesInPlay.length} files</span>
              </div>

              {conflicts.length > 0 && <ConflictBanner conflicts={conflicts} />}

              {hasFiles && (
                <div className={styles.pathList}>
                  {filesInPlay.map((file) => (
                    <span key={file} className={styles.pathRow}>{file}</span>
                  ))}
                </div>
              )}

              {hasLocks && (
                <div className={hasFiles ? styles.lockList : undefined}>
                  {locks.map((lock, index) => (
                    <LockRow
                      key={lock.file_path || `${lock.owner_handle || 'lock'}:${index}`}
                      lock={lock}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {hasToolMix && (
            <section className={styles.block}>
              <div className={styles.blockHeader}>
                <h2 className={styles.blockTitle}>Live tools</h2>
                <span className={styles.blockMeta}>Active agents</span>
              </div>
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
            </section>
          )}
        </div>
      )}
    </div>
  );
}

export function ProjectMemoryTab({
  memories,
  memoryBreakdown,
  onUpdateMemory,
  onDeleteMemory,
}) {
  const [search, setSearch] = useState('');
  const [activeTag, setActiveTag] = useState(null);
  const allTags = useMemo(() => memoryBreakdown.map(([tag]) => tag), [memoryBreakdown]);

  const filtered = useMemo(() => {
    let list = memories;
    if (activeTag) list = list.filter((m) => (m.tags || []).includes(activeTag));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((m) => m.text.toLowerCase().includes(q) || (m.tags || []).some((t) => t.includes(q)));
    }
    return list;
  }, [memories, activeTag, search]);

  if (memories.length === 0) {
    return <EmptyState title="No memory saved" hint="Agents save shared knowledge here." />;
  }

  return (
    <div>
      <div className={styles.memoryControls}>
        {(memories.length > 3 || allTags.length > 0) && (
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search memories"
            className={styles.searchInput}
          />
        )}
        {allTags.length > 0 && (
          <div className={styles.tagFilters}>
            {activeTag && (
              <button
                type="button"
                className={`${styles.tagPill} ${styles.tagPillClear}`}
                onClick={() => setActiveTag(null)}
              >
                All
              </button>
            )}
            {allTags.map((tag) => (
              <button
                key={tag}
                type="button"
                className={`${styles.tagPill} ${activeTag === tag ? styles.tagPillActive : ''}`}
                onClick={() => setActiveTag(activeTag === tag ? null : tag)}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={styles.sectionBody}>
        {filtered.length > 0 ? (
          filtered.map((memory) => (
            <MemoryRow
              key={memory.id}
              memory={memory}
              onUpdate={onUpdateMemory}
              onDelete={onDeleteMemory}
            />
          ))
        ) : (
          <p className={styles.emptyHint}>No matches.</p>
        )}
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
  const hasFiles = filesTouched.length > 0;

  if (sessions.length === 0) {
    return <EmptyState title="No recent sessions" hint="Reported sessions appear here." />;
  }

  return (
    <div className={styles.panelGrid}>
      <section className={styles.block}>
        <div className={styles.blockHeader}>
          <h2 className={styles.blockTitle}>Recent sessions</h2>
        </div>
        <div className={styles.sectionBody}>
          {sessions.map((session, index) => (
            <SessionRow
              key={session.session_id || `${session.owner_handle}:${session.started_at || index}`}
              session={session}
            />
          ))}
        </div>
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

        {hasFiles && (
          <section className={styles.block}>
            <div className={styles.blockHeader}>
              <h2 className={styles.blockTitle}>Files touched</h2>
              <span className={styles.blockMeta}>{filesTouched.length}</span>
            </div>
            <div className={styles.pathList}>
              {filesTouched.map((file) => (
                <span key={`history:${file}`} className={styles.pathRow}>{file}</span>
              ))}
            </div>
          </section>
        )}
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
  const hasUsage = usageEntries.length > 0;

  if (toolSummaries.length === 0) {
    return <EmptyState title="No tools configured" hint="Run npx chinwag init in this repo." />;
  }

  return (
    <div className={styles.panelGrid}>
      <section className={styles.block}>
        <div className={styles.blockHeader}>
          <h2 className={styles.blockTitle}>Tool usage</h2>
          <span className={styles.blockMeta}>Recorded joins</span>
        </div>
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

          {hasUsage && (
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
