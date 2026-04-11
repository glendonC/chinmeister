import clsx from 'clsx';
import { WIDGET_CATALOG, CATEGORIES } from './widget-catalog.js';
import styles from './OverviewView.module.css';

/**
 * Renders just the side panel + overlay.
 * The "Customize" button itself lives in the header (OverviewView).
 */
export function WidgetPanel({
  open,
  onClose,
  widgetIds,
  toggleWidget,
  editing,
  setEditing,
}: {
  open: boolean;
  onClose: () => void;
  widgetIds: string[];
  toggleWidget: (id: string) => void;
  editing: boolean;
  setEditing: (v: boolean) => void;
}) {
  if (!open) return null;

  return (
    <>
      <div className={styles.panelOverlay} onClick={onClose} />
      <div className={styles.sidePanel}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 20,
          }}
        >
          <span className={styles.panelTitle} style={{ margin: 0 }}>
            Customize
          </span>
          <button
            type="button"
            className={clsx(styles.customizeBtn, editing && styles.customizeBtnActive)}
            onClick={() => setEditing(!editing)}
          >
            {editing ? 'Done rearranging' : 'Rearrange'}
          </button>
        </div>
        {CATEGORIES.map((cat) => {
          const items = WIDGET_CATALOG.filter((w) => w.category === cat.id);
          if (items.length === 0) return null;
          return (
            <div key={cat.id}>
              <span className={styles.panelCategory}>{cat.label}</span>
              {items.map((w) => {
                const active = widgetIds.includes(w.id);
                return (
                  <div key={w.id} className={styles.panelItem} onClick={() => toggleWidget(w.id)}>
                    <div className={styles.panelItemInfo}>
                      <div className={styles.panelItemName}>{w.name}</div>
                      <div className={styles.panelItemDesc}>{w.description}</div>
                    </div>
                    <button
                      type="button"
                      className={clsx(styles.panelToggle, active && styles.panelToggleOn)}
                      aria-label={active ? `Remove ${w.name}` : `Add ${w.name}`}
                    />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </>
  );
}
