import { useState } from 'react';
import { useTeamStore } from '../../lib/stores/teams.js';
import styles from './Sidebar.module.css';

export default function Sidebar({ activeNav, onNavigate }) {
  const teams = useTeamStore((s) => s.teams);
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const selectTeam = useTeamStore((s) => s.selectTeam);
  const overviewActive = activeNav === null && activeTeamId === null;
  const toolsActive = activeNav === 'tools';
  const settingsActive = activeNav === 'settings';

  const [mobileOpen, setMobileOpen] = useState(false);

  function goOverview() {
    selectTeam(null);
    onNavigate(null);
    setMobileOpen(false);
  }

  function goTeam(teamId) {
    selectTeam(teamId);
    onNavigate(null);
    setMobileOpen(false);
  }

  function goTools() {
    onNavigate('tools');
    setMobileOpen(false);
  }

  function goSettings() {
    onNavigate('settings');
    setMobileOpen(false);
  }

  function handleKeydown(e, callback) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      callback();
    }
  }

  return (
    <>
      <button className={styles.mobileToggle} onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle sidebar">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          {mobileOpen ? (
            <path d="M5 5l10 10M15 5l-10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          ) : (
            <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          )}
        </svg>
      </button>

      {mobileOpen && (
        <div className={styles.mobileBackdrop} onClick={() => setMobileOpen(false)} role="presentation" />
      )}

      <aside className={`${styles.sidebar} ${mobileOpen ? styles.sidebarOpen : ''}`}>
        <div className={styles.sidebarLogo}>
          <svg width="36" height="36" viewBox="0 0 32 32">
            <path fill="#d49aae" d="M4 24 20 24 24 20 8 20z" />
            <path fill="#a896d4" d="M6 18 22 18 26 14 10 14z" />
            <path fill="#8ec0a4" d="M8 12 24 12 28 8 12 8z" />
          </svg>
        </div>

        <nav className={styles.sidebarNav}>
          <div
            className={`${styles.navItem} ${overviewActive ? styles.navItemActive : ''}`}
            role="button"
            tabIndex={0}
            onClick={goOverview}
            onKeyDown={(e) => handleKeydown(e, goOverview)}
          >
            <svg className={styles.navIcon} width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
              <rect x="9" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
              <rect x="1" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
              <rect x="9" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
            </svg>
            <span className={styles.navLabel}>Overview</span>
          </div>

          <div
            className={`${styles.navItem} ${toolsActive ? styles.navItemActive : ''}`}
            role="button"
            tabIndex={0}
            onClick={goTools}
            onKeyDown={(e) => handleKeydown(e, goTools)}
          >
            <svg className={styles.navIcon} width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" />
              <polygon points="6,10 7,7 10,6 9,9" fill="currentColor" />
            </svg>
            <span className={styles.navLabel}>Tools</span>
          </div>

          <div
            className={`${styles.navItem} ${settingsActive ? styles.navItemActive : ''}`}
            role="button"
            tabIndex={0}
            onClick={goSettings}
            onKeyDown={(e) => handleKeydown(e, goSettings)}
          >
            <svg className={styles.navIcon} width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.2" />
              <path d="M8 1v2M8 13v2M1 8h2M13 8h2M2.9 2.9l1.4 1.4M11.7 11.7l1.4 1.4M13.1 2.9l-1.4 1.4M4.3 11.7l-1.4 1.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            <span className={styles.navLabel}>Settings</span>
          </div>
        </nav>

        <div className={styles.sidebarSection}>
          <span className={styles.sectionHeader}>Projects</span>
          <div className={styles.projectList}>
            {teams.length > 0 ? (
              teams.map((team) => (
                <div
                  key={team.team_id}
                  className={`${styles.navItem} ${styles.navItemProject} ${activeTeamId === team.team_id && !activeNav ? styles.navItemActive : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => goTeam(team.team_id)}
                  onKeyDown={(e) => handleKeydown(e, () => goTeam(team.team_id))}
                >
                  <span className={styles.projectDot} />
                  <span className={styles.projectName}>{team.team_name || team.team_id}</span>
                </div>
              ))
            ) : (
              <p className={styles.sectionEmpty}>No projects yet</p>
            )}
          </div>
        </div>

        <div className={styles.sidebarSpacer} />
      </aside>
    </>
  );
}
