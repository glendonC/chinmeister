import { useState, useEffect, useMemo } from 'react';
import { useAuthStore } from '../../lib/stores/auth.js';
import { usePollingStore } from '../../lib/stores/polling.js';
import { api } from '../../lib/api.js';
import styles from './ToolsView.module.css';

export default function ToolsView() {
  const token = useAuthStore((s) => s.token);
  const dashboardData = usePollingStore((s) => s.dashboardData);

  const [catalog, setCatalog] = useState(null);
  const [categories, setCategories] = useState({});
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('all');
  const [dashboardSnapshot, setDashboardSnapshot] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchCatalog() {
      try {
        const data = await api('GET', '/tools/catalog', null, token);
        if (!cancelled) {
          setCatalog(data.tools || []);
          setCategories(data.categories || {});
        }
      } catch {
        if (!cancelled) setCatalog([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchCatalog();
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    if (dashboardData) {
      setDashboardSnapshot(dashboardData);
      return;
    }
    let cancelled = false;
    async function fetchDashboard() {
      try {
        const data = await api('GET', '/me/dashboard', null, token);
        if (!cancelled) setDashboardSnapshot(data);
      } catch {}
    }
    fetchDashboard();
    return () => { cancelled = true; };
  }, [dashboardData, token]);

  const userTools = useMemo(() => {
    const teams = dashboardSnapshot?.teams || [];
    const toolMap = new Map();
    for (const team of teams) {
      for (const t of (team.tools_configured || [])) {
        if (!toolMap.has(t.tool)) {
          toolMap.set(t.tool, { tool: t.tool, joins: 0, projects: [] });
        }
        const entry = toolMap.get(t.tool);
        entry.joins += t.joins || 0;
        entry.projects.push(team.team_name || team.team_id);
      }
    }
    return [...toolMap.values()].sort((a, b) => b.joins - a.joins);
  }, [dashboardSnapshot]);

  const userToolIds = useMemo(
    () => new Set(userTools.map(t => t.tool)),
    [userTools]
  );

  const filteredTools = useMemo(() => {
    if (!catalog) return [];
    if (activeCategory === 'all') return catalog;
    return catalog.filter(t => t.category === activeCategory);
  }, [catalog, activeCategory]);

  const categoryList = useMemo(() => Object.entries(categories), [categories]);

  if (loading) {
    return (
      <div className={styles.page}>
        <p className={styles.loadingText}>Loading catalog...</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Your tools</h2>
          {userTools.length > 0 && (
            <span className={styles.sectionCount}>{userTools.length} configured</span>
          )}
        </div>
        {userTools.length > 0 ? (
          <div className={styles.yourTools}>
            {userTools.map(t => {
              const catalogEntry = catalog?.find(c => c.id === t.tool);
              const displayName = catalogEntry?.name || t.tool;
              return (
                <div key={t.tool} className={styles.yourToolRow}>
                  <span className={styles.yourToolDot} />
                  <span className={styles.yourToolName}>{displayName}</span>
                  <span className={styles.yourToolProjects}>
                    {t.projects.join(', ')}
                  </span>
                  <span className={styles.yourToolJoins}>{t.joins} joins</span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className={styles.emptyHint}>
            No tools configured yet. Run <code>npx chinwag init</code> in a project.
          </p>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Discover</h2>
        </div>

        <div className={styles.categoryTabs}>
          <button
            className={`${styles.categoryTab} ${activeCategory === 'all' ? styles.categoryTabActive : ''}`}
            onClick={() => setActiveCategory('all')}
          >
            All
          </button>
          {categoryList.map(([id, label]) => (
            <button
              key={id}
              className={`${styles.categoryTab} ${activeCategory === id ? styles.categoryTabActive : ''}`}
              onClick={() => setActiveCategory(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className={styles.toolList}>
          {filteredTools.map(tool => {
            const isConfigured = userToolIds.has(tool.id);
            return (
              <div key={tool.id} className={styles.toolItem}>
                <div className={styles.toolTop}>
                  <span className={styles.toolName}>{tool.name}</span>
                  {isConfigured && <span className={styles.toolConfigured}>configured</span>}
                  {tool.featured && !isConfigured && <span className={styles.toolFeatured}>featured</span>}
                  {tool.website && (
                    <a
                      href={tool.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.toolLink}
                      aria-label={`Visit ${tool.name} website`}
                    >
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                        <path d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h10a1 1 0 001-1v-3M10 2h4v4M7 9l7-7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </a>
                  )}
                </div>
                {tool.description && (
                  <p className={styles.toolDesc}>{tool.description}</p>
                )}
                {tool.installCmd && (
                  <code className={styles.toolInstall}>{tool.installCmd}</code>
                )}
              </div>
            );
          })}
          {filteredTools.length === 0 && (
            <p className={styles.emptyHint}>No tools in this category.</p>
          )}
        </div>
      </section>
    </div>
  );
}
