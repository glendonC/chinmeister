// Preview data for Tools sections before real data flows through.
// When a section receives an empty live dataset, it falls back to these
// values and shows a "Preview" badge so the reader sees what the view
// looks like under real conditions. When real data arrives, the preview
// is replaced automatically — no flags, no toggles, no dead code path.
//
// Keep these numbers realistic: 3 tools with differentiated work-type
// mixes, and 6 handoff rows in both directions between them.

import type { ToolCallCategory } from '@chinwag/shared/tool-call-categories.js';
import type { ToolWorkTypeBreakdown, ToolHandoff } from '../../lib/apiSchemas.js';

export const PREVIEW_TOOL_WORK_TYPE: ToolWorkTypeBreakdown[] = [
  // Claude Code — feature-heavy, some refactor, some bugfix
  { host_tool: 'claude-code', work_type: 'feature', sessions: 58, edits: 412 },
  { host_tool: 'claude-code', work_type: 'refactor', sessions: 26, edits: 198 },
  { host_tool: 'claude-code', work_type: 'bugfix', sessions: 19, edits: 141 },
  { host_tool: 'claude-code', work_type: 'test', sessions: 13, edits: 87 },
  { host_tool: 'claude-code', work_type: 'docs', sessions: 7, edits: 34 },
  { host_tool: 'claude-code', work_type: 'config', sessions: 4, edits: 19 },
  { host_tool: 'claude-code', work_type: 'other', sessions: 2, edits: 8 },

  // Cursor — bugfix specialist
  { host_tool: 'cursor', work_type: 'bugfix', sessions: 26, edits: 134 },
  { host_tool: 'cursor', work_type: 'feature', sessions: 16, edits: 97 },
  { host_tool: 'cursor', work_type: 'refactor', sessions: 13, edits: 64 },
  { host_tool: 'cursor', work_type: 'docs', sessions: 9, edits: 22 },
  { host_tool: 'cursor', work_type: 'test', sessions: 6, edits: 28 },
  { host_tool: 'cursor', work_type: 'config', sessions: 2, edits: 7 },
  { host_tool: 'cursor', work_type: 'other', sessions: 2, edits: 5 },

  // Codex — refactor-dominant, heavy on config
  { host_tool: 'codex', work_type: 'refactor', sessions: 12, edits: 83 },
  { host_tool: 'codex', work_type: 'config', sessions: 6, edits: 28 },
  { host_tool: 'codex', work_type: 'feature', sessions: 5, edits: 31 },
  { host_tool: 'codex', work_type: 'bugfix', sessions: 3, edits: 14 },
  { host_tool: 'codex', work_type: 'test', sessions: 2, edits: 8 },
  { host_tool: 'codex', work_type: 'docs', sessions: 2, edits: 4 },
  { host_tool: 'codex', work_type: 'other', sessions: 1, edits: 2 },
];

export const PREVIEW_TOOL_HANDOFFS: ToolHandoff[] = [
  {
    from_tool: 'claude-code',
    to_tool: 'cursor',
    file_count: 18,
    handoff_completion_rate: 72,
  },
  {
    from_tool: 'cursor',
    to_tool: 'claude-code',
    file_count: 14,
    handoff_completion_rate: 61,
  },
  {
    from_tool: 'claude-code',
    to_tool: 'codex',
    file_count: 9,
    handoff_completion_rate: 83,
  },
  {
    from_tool: 'codex',
    to_tool: 'claude-code',
    file_count: 6,
    handoff_completion_rate: 67,
  },
  {
    from_tool: 'cursor',
    to_tool: 'codex',
    file_count: 4,
    handoff_completion_rate: 50,
  },
  {
    from_tool: 'codex',
    to_tool: 'cursor',
    file_count: 3,
    handoff_completion_rate: 44,
  },
];

// ── Stack adoption timeline ──
// When each tool first reported a session to chinwag.
export interface AdoptionEntry {
  toolId: string;
  adoptedOn: string;
  firstSessionSummary: string;
  sessionsSince: number;
}

export const PREVIEW_ADOPTION: AdoptionEntry[] = [
  {
    toolId: 'claude-code',
    adoptedOn: '2025-11-04',
    firstSessionSummary: 'Initial setup + feature scaffold',
    sessionsSince: 129,
  },
  {
    toolId: 'cursor',
    adoptedOn: '2026-01-18',
    firstSessionSummary: 'Bugfix sprint on payments',
    sessionsSince: 74,
  },
  {
    toolId: 'codex',
    adoptedOn: '2026-03-22',
    firstSessionSummary: 'Refactor pass in worker/',
    sessionsSince: 31,
  },
];

// ── Tool × Model effectiveness ──
// The join of host_tool and agent_model. DATA_MAP Tier 1 insight.
// Completion rate per (tool, model) cell. Only chinwag can render this.
export interface ToolModelCell {
  toolId: string;
  model: string;
  sessions: number;
  completionRate: number;
}

export const PREVIEW_MODELS = ['claude-sonnet-4-5', 'claude-opus-4-6', 'gpt-5.1'] as const;

export const PREVIEW_TOOL_MODEL: ToolModelCell[] = [
  { toolId: 'claude-code', model: 'claude-sonnet-4-5', sessions: 68, completionRate: 84 },
  { toolId: 'claude-code', model: 'claude-opus-4-6', sessions: 49, completionRate: 91 },
  { toolId: 'claude-code', model: 'gpt-5.1', sessions: 12, completionRate: 58 },
  { toolId: 'cursor', model: 'claude-sonnet-4-5', sessions: 38, completionRate: 74 },
  { toolId: 'cursor', model: 'claude-opus-4-6', sessions: 8, completionRate: 62 },
  { toolId: 'cursor', model: 'gpt-5.1', sessions: 28, completionRate: 69 },
  { toolId: 'codex', model: 'claude-sonnet-4-5', sessions: 4, completionRate: 50 },
  { toolId: 'codex', model: 'claude-opus-4-6', sessions: 2, completionRate: 50 },
  { toolId: 'codex', model: 'gpt-5.1', sessions: 25, completionRate: 72 },
];

// ── Tool rhythm (when you use what) ──
// 24-hour session distribution per tool, normalized share.
// Rendered as small multiples — one mini chart per tool.
export interface ToolHourlyEntry {
  toolId: string;
  hours: number[]; // length 24, hour 0 = midnight local
}

// Realistic shapes: Claude Code = workday focused, Cursor = late-night
// bursts, Codex = scattered + early morning spikes.
export const PREVIEW_TOOL_RHYTHM: ToolHourlyEntry[] = [
  {
    toolId: 'claude-code',
    hours: [0, 0, 0, 0, 0, 1, 2, 4, 8, 14, 16, 12, 10, 11, 15, 18, 14, 8, 4, 3, 2, 1, 0, 0],
  },
  {
    toolId: 'cursor',
    hours: [2, 3, 1, 0, 0, 0, 0, 2, 3, 5, 6, 5, 4, 5, 4, 6, 8, 10, 12, 14, 10, 8, 5, 3],
  },
  {
    toolId: 'codex',
    hours: [1, 0, 0, 0, 0, 3, 5, 4, 2, 1, 1, 1, 2, 2, 3, 3, 2, 1, 2, 1, 1, 2, 3, 1],
  },
];

// ── Drill-in: internal tool usage ──
// What tools each coding agent invokes during a session.
// Row = an internal tool (Read, Edit, Bash, Grep, chinwag_save_memory, etc.).
export interface InternalToolUsage {
  name: string;
  category: ToolCallCategory;
  calls: number;
  errorRate: number;
  avgMs: number;
}

export interface DrillInternalUsage {
  researchToEditRatio: number;
  topTools: InternalToolUsage[];
}

export const PREVIEW_INTERNAL_USAGE: Record<string, DrillInternalUsage> = {
  'claude-code': {
    researchToEditRatio: 4.2,
    topTools: [
      { name: 'Read', category: 'research', calls: 2143, errorRate: 1.2, avgMs: 42 },
      { name: 'Edit', category: 'edit', calls: 512, errorRate: 6.8, avgMs: 68 },
      { name: 'Grep', category: 'research', calls: 398, errorRate: 0.5, avgMs: 118 },
      { name: 'Bash', category: 'exec', calls: 287, errorRate: 11.4, avgMs: 1640 },
      { name: 'Glob', category: 'research', calls: 164, errorRate: 0.0, avgMs: 52 },
      { name: 'Write', category: 'edit', calls: 41, errorRate: 2.4, avgMs: 88 },
      { name: 'chinwag_save_memory', category: 'memory', calls: 22, errorRate: 0.0, avgMs: 95 },
    ],
  },
  cursor: {
    researchToEditRatio: 1.8,
    topTools: [
      { name: 'Read', category: 'research', calls: 621, errorRate: 0.8, avgMs: 38 },
      { name: 'Edit', category: 'edit', calls: 344, errorRate: 4.2, avgMs: 72 },
      { name: 'Grep', category: 'research', calls: 142, errorRate: 0.0, avgMs: 105 },
      { name: 'Bash', category: 'exec', calls: 88, errorRate: 9.1, avgMs: 1320 },
    ],
  },
  codex: {
    researchToEditRatio: 2.9,
    topTools: [
      { name: 'Read', category: 'research', calls: 287, errorRate: 2.1, avgMs: 45 },
      { name: 'Edit', category: 'edit', calls: 98, errorRate: 5.1, avgMs: 81 },
      { name: 'Bash', category: 'exec', calls: 62, errorRate: 14.5, avgMs: 1780 },
      { name: 'Grep', category: 'research', calls: 45, errorRate: 0.0, avgMs: 125 },
    ],
  },
};

// ── Drill-in: session shape timeline ──
// A representative session's tool-call sequence. Used for visual replay.
export interface SessionEvent {
  tool: string;
  category: ToolCallCategory;
  offsetSec: number;
  durationMs: number;
  isError: boolean;
}

function buildSessionShape(seed: number): SessionEvent[] {
  const events: SessionEvent[] = [];
  const pattern: [string, SessionEvent['category'], number][] = [
    ['Read', 'research', 40],
    ['Read', 'research', 45],
    ['Grep', 'research', 110],
    ['Read', 'research', 38],
    ['Read', 'research', 44],
    ['Edit', 'edit', 72],
    ['Read', 'research', 42],
    ['Bash', 'exec', 1450],
    ['Read', 'research', 39],
    ['Edit', 'edit', 85],
    ['Read', 'research', 41],
    ['Grep', 'research', 98],
    ['Read', 'research', 37],
    ['Edit', 'edit', 64],
    ['Bash', 'exec', 1880],
    ['Read', 'research', 43],
    ['Edit', 'edit', 71],
    ['chinwag_save_memory', 'memory', 92],
    ['Read', 'research', 38],
    ['Edit', 'edit', 76],
  ];
  let t = 0;
  for (let i = 0; i < pattern.length; i++) {
    const [tool, category, durationMs] = pattern[i];
    const gap = 2 + ((seed + i * 7) % 9);
    t += gap;
    events.push({
      tool,
      category,
      offsetSec: t,
      durationMs,
      isError: (seed + i) % 17 === 0,
    });
  }
  return events;
}

export const PREVIEW_SESSION_SHAPES: Record<string, SessionEvent[]> = {
  'claude-code': buildSessionShape(3),
  cursor: buildSessionShape(11),
  codex: buildSessionShape(23),
};

// ── Drill-in: scope complexity ──
// How many files a typical session on this tool touches.
export interface ScopeBucket {
  label: string;
  sessions: number;
  completionRate: number;
}

export const PREVIEW_SCOPE_COMPLEXITY: Record<string, ScopeBucket[]> = {
  'claude-code': [
    { label: '1 file', sessions: 22, completionRate: 95 },
    { label: '2–5 files', sessions: 61, completionRate: 88 },
    { label: '6–15 files', sessions: 34, completionRate: 71 },
    { label: '16+ files', sessions: 12, completionRate: 42 },
  ],
  cursor: [
    { label: '1 file', sessions: 38, completionRate: 89 },
    { label: '2–5 files', sessions: 26, completionRate: 73 },
    { label: '6–15 files', sessions: 8, completionRate: 50 },
    { label: '16+ files', sessions: 2, completionRate: 0 },
  ],
  codex: [
    { label: '1 file', sessions: 5, completionRate: 80 },
    { label: '2–5 files', sessions: 14, completionRate: 71 },
    { label: '6–15 files', sessions: 10, completionRate: 60 },
    { label: '16+ files', sessions: 2, completionRate: 50 },
  ],
};
