import type { WidgetCategory } from './types.js';

/**
 * Category metadata for the customize picker. Ordering here drives the tab
 * order in the picker UI.
 */
export const CATEGORIES: Array<{ id: WidgetCategory; label: string }> = [
  { id: 'live', label: 'live' },
  { id: 'usage', label: 'usage' },
  { id: 'outcomes', label: 'outcomes' },
  { id: 'activity', label: 'activity' },
  { id: 'codebase', label: 'codebase' },
  { id: 'tools', label: 'tools & models' },
  { id: 'conversations', label: 'conversations' },
  { id: 'memory', label: 'memory' },
  { id: 'team', label: 'team' },
];
