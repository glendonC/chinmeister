import styles from './ViewHeader.module.css';

export default function ViewHeader({ eyebrow, title }) {
  return (
    <header className={styles.header}>
      <div className={styles.copy}>
        {eyebrow && <span className={styles.eyebrow}>{eyebrow}</span>}
        <h1 className={styles.title}>{title}</h1>
      </div>
    </header>
  );
}
