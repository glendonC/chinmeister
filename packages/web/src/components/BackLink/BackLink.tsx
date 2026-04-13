import styles from './BackLink.module.css';

interface Props {
  label: string;
  onClick: () => void;
}

export default function BackLink({ label, onClick }: Props) {
  return (
    <button
      type="button"
      className={styles.backLink}
      onClick={onClick}
      aria-label={`Back to ${label}`}
    >
      <span className={styles.icon} aria-hidden="true">
        {'\u2190'}
      </span>
      <span className={styles.label}>{label}</span>
    </button>
  );
}
