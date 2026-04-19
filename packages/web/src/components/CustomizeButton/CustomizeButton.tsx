import clsx from 'clsx';
import styles from './CustomizeButton.module.css';

interface Props {
  active?: boolean;
  onClick: () => void;
  label?: string;
  /**
   * Optional keyboard shortcut to surface as a small kbd badge inside the
   * button. Persistent across the active state so the button doesn't shift
   * when toggled and so the shortcut stays discoverable while the user is
   * mid-flow. The shortcut is expected to act as a toggle (open AND close)
   * rather than open-only.
   */
  kbd?: string;
}

export default function CustomizeButton({
  active = false,
  onClick,
  label = 'Customize',
  kbd,
}: Props) {
  return (
    <button
      type="button"
      className={clsx(styles.customizeBtn, active && styles.customizeBtnActive)}
      onClick={onClick}
      aria-pressed={active}
    >
      {label}
      {kbd && <kbd className={styles.kbd}>{kbd}</kbd>}
    </button>
  );
}
