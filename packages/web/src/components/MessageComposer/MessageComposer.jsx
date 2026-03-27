import { useState } from 'react';
import styles from './MessageComposer.module.css';

export default function MessageComposer({ onSend }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  async function handleSend() {
    const msg = text.trim();
    if (!msg || sending) return;
    setSending(true);
    setError(null);
    try {
      await onSend(msg);
      setText('');
    } catch (err) {
      setError(err.message || 'Send failed');
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className={styles.composer}>
      <div className={styles.inputRow}>
        <input
          type="text"
          className={styles.input}
          placeholder="Message this project"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={500}
          disabled={sending}
        />
        <button
          className={styles.sendBtn}
          onClick={handleSend}
          disabled={!text.trim() || sending}
          aria-label="Send message"
        >
          {sending ? 'Sending...' : 'Send'}
        </button>
      </div>
      {error && <span className={styles.error}>{error}</span>}
    </div>
  );
}
