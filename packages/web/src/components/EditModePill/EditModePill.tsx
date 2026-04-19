import { createPortal } from 'react-dom';
import styles from './EditModePill.module.css';

interface Props {
  onDone: () => void;
}

/**
 * Floating "Done editing" affordance shown when the dashboard is in
 * rearrange mode but the customize catalog is closed. Without this, the
 * only exit from edit mode is the strip's Rearrange toggle, which lives
 * inside the catalog — closing the catalog while still editing strands
 * the user in a state with visible widget chrome but no exit. This pill
 * fills that gap and makes the "close catalog, keep rearranging" workflow
 * safe.
 *
 * Sits at the same bottom-right anchor as the customize strip so the two
 * never overlap (they're mutually exclusive: pill shows when catalog is
 * closed, strip shows when catalog is open).
 */
export default function EditModePill({ onDone }: Props) {
  return createPortal(
    <button type="button" className={styles.pill} onClick={onDone}>
      Done editing
      <kbd className={styles.kbd}>Esc</kbd>
    </button>,
    document.body,
  );
}
