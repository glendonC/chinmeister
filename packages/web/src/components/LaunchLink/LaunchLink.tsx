import styles from './LaunchLink.module.css';

interface Props {
  label?: string;
  onClick: () => void;
}

export default function LaunchLink({ label = 'Launch', onClick }: Props) {
  return (
    <button
      type="button"
      className={styles.launchLink}
      onClick={onClick}
      aria-label={`Launch ${label}`}
    >
      <span className={styles.label}>{label}</span>
      <span className={styles.icon} aria-hidden="true">
        {'\u2192'}
      </span>
    </button>
  );
}
