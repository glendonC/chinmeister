import { useState, useMemo } from 'react';
import MemoryRow from '../../components/MemoryRow/MemoryRow.jsx';
import EmptyState from '../../components/EmptyState/EmptyState.jsx';
import styles from './ProjectView.module.css';

export default function ProjectMemoryTab({
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
