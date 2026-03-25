import { useState } from 'react';
import { useAuthStore } from '../../lib/stores/auth.js';
import { useTeamStore } from '../../lib/stores/teams.js';
import { stopPolling } from '../../lib/stores/polling.js';
import styles from './Sidebar.module.css';

export default function Sidebar() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const teams = useTeamStore((s) => s.teams);
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const selectTeam = useTeamStore((s) => s.selectTeam);

  const overviewMode = activeTeamId === null;

  const [mobileOpen, setMobileOpen] = useState(false);

  function goOverview() {
    selectTeam(null);
    setMobileOpen(false);
  }

  function goTeam(teamId) {
    selectTeam(teamId);
    setMobileOpen(false);
  }

  function handleLogout() {
    stopPolling();
    logout();
  }

  function handleKeydown(e, callback) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      callback();
    }
  }

  return (
    <>
      {/* Mobile toggle button */}
      <button className={styles.mobileToggle} onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle sidebar">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          {mobileOpen ? (
            <path d="M5 5l10 10M15 5l-10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          ) : (
            <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          )}
        </svg>
      </button>

      {/* Backdrop for mobile */}
      {mobileOpen && (
        <div className={styles.mobileBackdrop} onClick={() => setMobileOpen(false)} role="presentation" />
      )}

      <aside className={`${styles.sidebar} ${mobileOpen ? styles.sidebarOpen : ''}`}>
        {/* Logo */}
        <div className={styles.sidebarLogo}>
          <svg width="20" height="20" viewBox="0 0 32 32">
            <path fill="#d49aae" d="M4 24 20 24 24 20 8 20z" />
            <path fill="#a896d4" d="M6 18 22 18 26 14 10 14z" />
            <path fill="#8ec0a4" d="M8 12 24 12 28 8 12 8z" />
          </svg>
          <span className={styles.sidebarLogoText}>chinwag</span>
        </div>

        {/* Navigation */}
        <nav className={styles.sidebarNav}>
          <div
            className={`${styles.navItem} ${overviewMode ? styles.navItemActive : ''}`}
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
        </nav>

        {/* Projects */}
        <div className={styles.sidebarSection}>
          <span className={styles.sectionHeader}>PROJECTS</span>
          <div className={styles.projectList}>
            {teams.length > 0 ? (
              teams.map((team) => (
                <div
                  key={team.team_id}
                  className={`${styles.navItem} ${styles.navItemProject} ${activeTeamId === team.team_id ? styles.navItemActive : ''}`}
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

        {/* Spacer */}
        <div className={styles.sidebarSpacer} />

        {/* Bottom: user + sign out */}
        <div className={styles.sidebarBottom}>
          {user && (
            <div className={styles.userInfo}>
              <span className={styles.userDot} />
              <span className={styles.userHandle}>{user.handle}</span>
            </div>
          )}
          <button className={styles.signoutBtn} onClick={handleLogout}>Sign out</button>
        </div>
      </aside>
    </>
  );
}
