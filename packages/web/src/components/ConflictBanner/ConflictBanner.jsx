import styles from './ConflictBanner.module.css';

export default function ConflictBanner({ conflicts }) {
  return (
    <section className={styles.conflictsBanner}>
      <div className={styles.conflictsHeader}>
        <span className={styles.conflictsIcon} aria-hidden="true">!</span>
        <h2 className={styles.conflictsTitle}>Conflicts</h2>
      </div>
      <div className={styles.conflictsList}>
        {conflicts.map(([file, owners]) => (
          <div key={file} className={styles.conflictRow}>
            <span className={styles.conflictFile}>{file}</span>
            <span className={styles.conflictOwners}>{owners.join(' & ')}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
