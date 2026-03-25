import { useState, useEffect, useMemo } from 'react';
import { useTeamStore } from '../../lib/stores/teams.js';
import { usePollingStore } from '../../lib/stores/polling.js';
import styles from './TopBar.module.css';

function formatTime(date) {
  const now = new Date();
  const diff = Math.floor((now - date) / 1000);
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function TopBar() {
  const pollError = usePollingStore((s) => s.pollError);
  const lastUpdate = usePollingStore((s) => s.lastUpdate);
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const teams = useTeamStore((s) => s.teams);

  const overviewMode = activeTeamId === null;
  const activeTeam = teams.find((t) => t.team_id === activeTeamId) || null;

  const statusText = pollError ? 'Connection issue' : 'Live';
  const statusClass = pollError ? styles.statusWarn : styles.statusOk;

  const pageTitle = overviewMode
    ? 'Overview'
    : (activeTeam?.team_name || 'Project');

  // Tick counter to force re-evaluation of relative time display
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 10000);
    return () => clearInterval(interval);
  }, []);

  const formattedTime = useMemo(() => {
    void tick; // subscribe to tick changes
    return lastUpdate ? formatTime(lastUpdate) : null;
  }, [lastUpdate, tick]);

  return (
    <header className={styles.topbar}>
      <div className={styles.topbarLeft}>
        <h1 className={styles.pageTitle}>{pageTitle}</h1>
      </div>
      <div className={styles.topbarRight}>
        <div className={styles.statusGroup}>
          <span className={`${styles.statusDot} ${statusClass}`} />
          <span className={styles.statusLabel}>{statusText}</span>
          {formattedTime && (
            <>
              <span className={styles.statusSep}>&middot;</span>
              <span className={styles.statusTime}>{formattedTime}</span>
            </>
          )}
        </div>
        <a className={styles.privacyLink} href="/privacy.html" target="_blank" rel="noopener">Privacy</a>
      </div>
    </header>
  );
}
