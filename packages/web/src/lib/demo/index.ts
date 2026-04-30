// Public demo module API. Components should import from here, not from the
// internal scenario / baseline files directly.

export {
  DEMO_SCENARIOS,
  DEMO_SCENARIO_IDS,
  DEMO_CATEGORY_ORDER,
  DEMO_CATEGORY_LABELS,
  DEMO_DIMENSION_LABELS,
  DEMO_VIEW_LABELS,
  DEFAULT_SCENARIO,
  getDemoData,
  isDemoScenarioId,
  type DemoData,
  type DemoScenario,
  type DemoScenarioId,
  type DemoCategory,
  type DemoDimension,
  type DemoView,
} from './scenarios.js';

export { createBaselineAnalytics } from './baseline.js';
export { createBaselineConversation } from './conversation.js';
export { createBaselineLive, createEmptyLive, type LiveDemoData } from './live.js';
export {
  createBaselineReports,
  createEmptyReports,
  getRunsForReport,
  getLatestRun,
  getRun,
  getCompletedReport,
  getCompletedReportFor,
  type ReportsDemoData,
} from './reports.js';

export { createBaselineMe, createBaselineTeams, createEmptyTeams } from './me.js';

export {
  createBaselineDashboard,
  createEmptyDashboard,
  createBaselineTeamContexts,
  createEmptyTeamContexts,
} from './dashboard.js';

export {
  createBaselineGlobalRank,
  createEmptyGlobalRank,
  createBaselineGlobalStats,
  createEmptyGlobalStats,
  createBaselineSessions,
  createEmptySessions,
  type SessionsDemoData,
} from './global.js';
