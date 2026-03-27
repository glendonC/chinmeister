import styles from './ConflictBanner.module.css';

export default function ConflictBanner({ conflicts }) {
  const items = conflicts.map((entry) => (
    Array.isArray(entry)
      ? { file: entry[0], owners: entry[1] }
      : { file: entry.file, owners: entry.owners || entry.agents || [] }
  ));

  return (
    <section className={styles.conflictsBanner}>
      <p className={styles.conflictsLead}>
        {items.length} overlapping file{items.length === 1 ? '' : 's'}
      </p>
      <div className={styles.conflictsList}>
        {items.map(({ file, owners }) => (
          <div key={file} className={styles.conflictRow}>
            <span className={styles.conflictFile}>{file}</span>
            <span className={styles.conflictOwners}>{owners.join(' & ')}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
