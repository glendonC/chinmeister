// Dev-only fixture for refining the Live widgets (live-agents,
// live-conflicts, files-in-play, claimed-files) when there is no real
// session activity to hydrate them.
//
// Consumed behind `import.meta.env.DEV` in OverviewView so the fixture is
// tree-shaken out of production builds. Delete this file and its import
// site when the widget is finalised and we no longer need mock hydration.

import type { LiveAgent } from './types.js';
import type { Lock } from '../lib/schemas/common.js';

const TEAM_ID = 'demo-active-files';
const TEAM_NAME = 'demo';

interface DemoAgent {
  handle: string;
  host_tool: string;
  files: string[];
  summary: string;
  session_minutes: number;
  seconds_since_update: number;
}

const DEMO_AGENTS: DemoAgent[] = [
  {
    handle: 'ada',
    host_tool: 'claude-code',
    files: [
      'packages/mcp/lib/tools/activity.ts',
      'packages/web/src/widgets/bodies/LiveWidgets.tsx',
      'packages/web/src/views/OverviewView/OverviewView.tsx',
      'packages/web/src/widgets/widget-catalog.ts',
      'packages/worker/src/dos/team/schema.ts',
    ],
    summary: 'wiring demo fixture into overview',
    session_minutes: 42,
    seconds_since_update: 6,
  },
  {
    handle: 'nova',
    host_tool: 'cursor',
    files: [
      'packages/mcp/lib/tools/activity.ts',
      'packages/worker/src/dos/team/context.ts',
      'docs/ARCHITECTURE.md',
      'packages/cli/lib/dashboard/hooks/useCollectorSubscription.ts',
    ],
    summary: 'auditing activity pipeline end-to-end',
    session_minutes: 18,
    seconds_since_update: 22,
  },
  {
    handle: 'orion',
    host_tool: 'codex',
    files: [
      'packages/web/src/widgets/bodies/LiveWidgets.tsx',
      'packages/worker/src/dos/team/context.ts',
      'packages/shared/src/tool-registry.ts',
      'packages/web/src/lib/stores/polling.ts',
    ],
    summary: 'cross-tool refactor — unifying registry lookups',
    session_minutes: 65,
    seconds_since_update: 9,
  },
  {
    handle: 'pax',
    host_tool: 'aider',
    files: [
      'packages/mcp/lib/tools/activity.ts',
      'packages/web/src/components/SectionOverflow/SectionOverflow.tsx',
      'packages/cli/lib/setup.js',
    ],
    summary: 'hardening section overflow accessibility',
    session_minutes: 11,
    seconds_since_update: 3,
  },
  {
    handle: 'jules',
    host_tool: 'claude-code',
    files: [
      'packages/worker/src/routes/team/activity.ts',
      'packages/web/src/widgets/WidgetCatalog.tsx',
    ],
    summary: 'tightening activity route validation',
    session_minutes: 27,
    seconds_since_update: 34,
  },
];

export const DEMO_LIVE_AGENTS: LiveAgent[] = DEMO_AGENTS.map((a) => ({
  agent_id: `demo-${a.handle}`,
  handle: a.handle,
  host_tool: a.host_tool,
  agent_surface: null,
  files: a.files,
  summary: a.summary,
  session_minutes: a.session_minutes,
  seconds_since_update: a.seconds_since_update,
  teamName: TEAM_NAME,
  teamId: TEAM_ID,
}));

// Two claims: one on the most-contested file (claimed pill on a 3-agent row),
// one on a single-agent file (claimed pill without danger colour). A third
// claim with no matching active edit would only affect the claimed-files
// widget, not this one, so we skip it here.
export const DEMO_LOCKS: Lock[] = [
  {
    file_path: 'packages/mcp/lib/tools/activity.ts',
    agent_id: 'demo-ada',
    handle: 'ada',
    host_tool: 'claude-code',
    agent_surface: null,
    minutes_held: 12,
  },
  {
    file_path: 'packages/web/src/views/OverviewView/OverviewView.tsx',
    agent_id: 'demo-ada',
    handle: 'ada',
    host_tool: 'claude-code',
    agent_surface: null,
    minutes_held: 4,
  },
];
