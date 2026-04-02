// Dashboard-wide context for shared dependencies.
// Provides config and team identity to hooks and deeply nested components
// without threading props through every intermediate component.

import React, { createContext, useContext } from 'react';

const DashboardContext = createContext(null);

export function DashboardProvider({ config, navigate, children }) {
  const value = React.useMemo(() => ({ config, navigate }), [config, navigate]);
  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

/**
 * Access dashboard-wide config and navigation from any nested component.
 * Falls back to null if used outside DashboardProvider (e.g. in tests).
 */
export function useDashboardContext() {
  return useContext(DashboardContext);
}
