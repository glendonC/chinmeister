// Limits for the cross-team analytics handler.
//
// Individual per-team queries can span 90 days; multi-team aggregation
// allocates 45+ accumulator maps in worker memory, so we cap the window
// more aggressively when more than one team is in play.

export const ANALYTICS_MAX_DAYS = 90;
export const CROSS_TEAM_MAX_DAYS = 30;
