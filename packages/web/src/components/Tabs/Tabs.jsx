import styles from './Tabs.module.css';

export default function Tabs({ tabs, active, onTabChange, children }) {
  return (
    <div className={styles.tabsContainer}>
      <div className={styles.tabsNav} role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            className={`${styles.tabBtn} ${active === tab.id ? styles.active : ''}`}
            onClick={() => onTabChange(tab.id)}
            aria-selected={active === tab.id}
          >
            {tab.label}
            {tab.badge != null && (
              <span className={styles.tabBadge}>{tab.badge}</span>
            )}
          </button>
        ))}
      </div>
      <div className={styles.tabsPanel} role="tabpanel">
        {children}
      </div>
    </div>
  );
}
