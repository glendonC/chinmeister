import { useState } from 'react';
import styles from './KeyboardHint.module.css';

const STORAGE_KEY = 'chinwag:hint:arrow-nav-v2';
const alreadySeen = (): boolean => !!localStorage.getItem(STORAGE_KEY);

interface Props {
  open: boolean;
  onOpen: () => void;
  onDismiss: () => void;
}

export default function KeyboardHint({ open, onOpen, onDismiss }: Props) {
  if (alreadySeen()) return null;

  return (
    <span className={styles.wrapper}>
      {!open ? (
        <button
          type="button"
          className={styles.trigger}
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          aria-label="Keyboard shortcut hint"
        >
          ?
        </button>
      ) : (
        <span className={styles.popover}>
          <span className={styles.keys}>
            <kbd className={styles.key}>&larr;</kbd>
            <kbd className={styles.key}>&rarr;</kbd>
          </span>
          <span className={styles.text}>to navigate</span>
          <button
            type="button"
            className={styles.dismiss}
            onClick={(e) => {
              e.stopPropagation();
              onDismiss();
            }}
          >
            Got it
          </button>
        </span>
      )}
    </span>
  );
}

interface KeyboardHintState {
  open: boolean;
  onOpen: () => void;
  onDismiss: () => void;
}

export function useKeyboardHint(): KeyboardHintState {
  const [open, setOpen] = useState(false);
  return {
    open,
    onOpen: () => setOpen(true),
    onDismiss: () => {
      localStorage.setItem(STORAGE_KEY, '1');
      setOpen(false);
    },
  };
}
