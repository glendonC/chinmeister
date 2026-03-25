import styles from './MessageRow.module.css';

export default function MessageRow({ message }) {
  const from =
    message.from_tool && message.from_tool !== 'unknown'
      ? `${message.from_handle} (${message.from_tool})`
      : message.from_handle;

  return (
    <div className={styles.messageRow}>
      <span className={styles.messageFrom}>{from}</span>
      <span className={styles.messageText}>{message.text}</span>
    </div>
  );
}
