// Demo-only data for unbuilt backend features. Lives here, never in the
// canonical UserAnalyticsSchema or shared contracts, because no worker
// query produces these fields. Putting them on the canonical schema as
// optional vaporware would pollute every package that imports the contract
// (worker, MCP, CLI, web) for a benefit only the web demo needs.
//
// Each entry below names the worker query that would produce it. When the
// query ships, move the field into the canonical schema, populate it from
// the real source, and delete the corresponding entry here.

import type { ToolCallCategory } from '@chinmeister/shared/tool-call-categories.js';

export interface InternalToolUsage {
  name: string;
  category: ToolCallCategory;
  calls: number;
  errorRate: number;
  avgMs: number;
}

export interface InternalUsageData {
  /** Reads + searches per edit. Higher = more context-gathering before changes. */
  researchToEditRatio: number;
  /** Top internal tools the agent invokes during a session. */
  topTools: InternalToolUsage[];
}

export interface SessionEvent {
  tool: string;
  category: ToolCallCategory;
  offsetSec: number;
  durationMs: number;
  isError: boolean;
}

/**
 * Demo-only fields that ride alongside `UserAnalytics` for unbuilt-backend
 * surfaces. Web-only; never crosses the canonical contract.
 *
 * - `internalUsage`: derivable from `tool_calls` aggregated per host_tool.
 *   Worker query not yet shipped.
 * - `sessionShapes`: per-tool representative session timeline. Requires
 *   per-session event capture beyond what's currently stored.
 */
export interface DemoOnlyExtensions {
  internalUsage: Record<string, InternalUsageData>;
  sessionShapes: Record<string, SessionEvent[]>;
}

const SESSION_SHAPE_PATTERN: ReadonlyArray<readonly [string, ToolCallCategory, number]> = [
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
  ['chinmeister_save_memory', 'memory', 92],
  ['Read', 'research', 38],
  ['Edit', 'edit', 76],
];

function buildSessionShape(seed: number): SessionEvent[] {
  const events: SessionEvent[] = [];
  let t = 0;
  for (let i = 0; i < SESSION_SHAPE_PATTERN.length; i++) {
    const [tool, category, durationMs] = SESSION_SHAPE_PATTERN[i];
    t += 2 + ((seed + i * 7) % 9);
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

const INTERNAL_USAGE: Record<string, InternalUsageData> = {
  'claude-code': {
    researchToEditRatio: 4.2,
    topTools: [
      { name: 'Read', category: 'research', calls: 2143, errorRate: 1.2, avgMs: 42 },
      { name: 'Edit', category: 'edit', calls: 512, errorRate: 6.8, avgMs: 68 },
      { name: 'Grep', category: 'research', calls: 398, errorRate: 0.5, avgMs: 118 },
      { name: 'Bash', category: 'exec', calls: 287, errorRate: 11.4, avgMs: 1640 },
      { name: 'Glob', category: 'research', calls: 164, errorRate: 0.0, avgMs: 52 },
      { name: 'Write', category: 'edit', calls: 41, errorRate: 2.4, avgMs: 88 },
      { name: 'chinmeister_save_memory', category: 'memory', calls: 22, errorRate: 0.0, avgMs: 95 },
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

const SESSION_SHAPES: Record<string, SessionEvent[]> = {
  'claude-code': buildSessionShape(3),
  cursor: buildSessionShape(11),
  codex: buildSessionShape(23),
};

const DEMO_EXTENSIONS: DemoOnlyExtensions = {
  internalUsage: INTERNAL_USAGE,
  sessionShapes: SESSION_SHAPES,
};

/**
 * Returns the demo extensions for a scenario, or null when the scenario
 * is meant to render empty states (e.g. `empty`). Live mode never calls
 * this — see `useDemoExtensions`.
 */
export function getDemoExtensions(scenarioId: string): DemoOnlyExtensions | null {
  if (scenarioId === 'empty') return null;
  return DEMO_EXTENSIONS;
}
