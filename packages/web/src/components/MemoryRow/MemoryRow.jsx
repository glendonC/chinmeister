import { MEMORY_CATEGORIES } from '../../lib/utils.js';
import styles from './MemoryRow.module.css';

export default function MemoryRow({ memory }) {
  const tagStyle = MEMORY_CATEGORIES.has(memory.category)
    ? styles[`tag_${memory.category}`]
    : styles.tag_reference;

  return (
    <div className={styles.memoryRow}>
      <span className={`${styles.tag} ${tagStyle}`}>{memory.category}</span>
      <span className={styles.memoryText}>{memory.text}</span>
    </div>
  );
}
