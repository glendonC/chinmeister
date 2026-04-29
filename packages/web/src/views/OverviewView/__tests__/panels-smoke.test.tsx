// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import { createBaselineAnalytics } from '../../../lib/demo/baseline.js';
import { qualifyByVolume } from '../../../lib/qualifyByVolume.js';

import { SessionsPanel as UsageSessions } from '../UsageDetailView/panels/SessionsPanel.js';
import { EditsPanel } from '../UsageDetailView/panels/EditsPanel.js';
import { LinesPanel } from '../UsageDetailView/panels/LinesPanel.js';
import { CostPanel } from '../UsageDetailView/panels/CostPanel.js';
import { CostPerEditPanel } from '../UsageDetailView/panels/CostPerEditPanel.js';
import { FilesTouchedPanel } from '../UsageDetailView/panels/FilesTouchedPanel.js';

import { SessionsPanel as OutcomesSessions } from '../OutcomesDetailView/panels/SessionsPanel.js';
import { RetriesPanel } from '../OutcomesDetailView/panels/RetriesPanel.js';
import { WorkTypesPanel } from '../OutcomesDetailView/panels/WorkTypesPanel.js';

import { RhythmPanel } from '../ActivityDetailView/panels/RhythmPanel.js';
import { MixPanel } from '../ActivityDetailView/panels/MixPanel.js';
import { EffectiveHoursPanel } from '../ActivityDetailView/panels/EffectiveHoursPanel.js';

import { LandscapePanel } from '../CodebaseDetailView/panels/LandscapePanel.js';
import { DirectoriesPanel } from '../CodebaseDetailView/panels/DirectoriesPanel.js';
import { RiskPanel } from '../CodebaseDetailView/panels/RiskPanel.js';
import { CommitsPanel } from '../CodebaseDetailView/panels/CommitsPanel.js';

import { ToolsPanel } from '../ToolsDetailView/panels/ToolsPanel.js';
import { FlowPanel } from '../ToolsDetailView/panels/FlowPanel.js';
import { ErrorsPanel } from '../ToolsDetailView/panels/ErrorsPanel.js';

import { HealthPanel } from '../MemoryDetailView/panels/HealthPanel.js';
import { FreshnessPanel } from '../MemoryDetailView/panels/FreshnessPanel.js';
import { CrossToolPanel } from '../MemoryDetailView/panels/CrossToolPanel.js';
import { AuthorshipPanel } from '../MemoryDetailView/panels/AuthorshipPanel.js';
import { HygienePanel } from '../MemoryDetailView/panels/HygienePanel.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function mount(node: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(node);
  });
  return {
    container,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

afterEach(() => {
  document.body.innerHTML = '';
});

const analytics = createBaselineAnalytics();

// Pre-compute the props that EffectiveHoursPanel and RhythmPanel expect,
// using the same derivations the orchestrator does.
const peakCell = (() => {
  const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const h of analytics.hourly_distribution) {
    grid[h.dow][h.hour] = (grid[h.dow][h.hour] || 0) + h.sessions;
  }
  let best: { dow: number; hour: number; sessions: number } | null = null;
  for (let dow = 0; dow < 7; dow++) {
    for (let hour = 0; hour < 24; hour++) {
      const v = grid[dow][hour];
      if (v > 0 && (best === null || v > best.sessions)) {
        best = { dow, hour, sessions: v };
      }
    }
  }
  return best;
})();
const qualifiedHours = qualifyByVolume(
  analytics.hourly_effectiveness.filter((h) => h.sessions > 0),
  (h) => h.sessions,
  25,
);

// Each entry: name, render() that returns a JSX element to mount.
// Render functions stay self-contained so the table is the source of truth
// for "this panel renders against baseline analytics without crashing."
type PanelCase = readonly [name: string, render: () => React.ReactElement];

const cases: PanelCase[] = [
  // Usage
  ['UsageSessions', () => <UsageSessions analytics={analytics} />],
  ['Edits', () => <EditsPanel analytics={analytics} />],
  ['Lines', () => <LinesPanel analytics={analytics} />],
  ['Cost', () => <CostPanel analytics={analytics} />],
  ['CostPerEdit', () => <CostPerEditPanel analytics={analytics} />],
  ['FilesTouched', () => <FilesTouchedPanel analytics={analytics} />],

  // Outcomes
  ['OutcomesSessions', () => <OutcomesSessions analytics={analytics} />],
  ['Retries', () => <RetriesPanel analytics={analytics} />],
  ['WorkTypes', () => <WorkTypesPanel analytics={analytics} />],

  // Activity
  ['Rhythm', () => <RhythmPanel analytics={analytics} peakCell={peakCell} />],
  ['Mix', () => <MixPanel analytics={analytics} />],
  [
    'EffectiveHours',
    () => <EffectiveHoursPanel analytics={analytics} qualifiedHours={qualifiedHours} />,
  ],

  // Codebase
  ['Landscape', () => <LandscapePanel analytics={analytics} />],
  ['Directories', () => <DirectoriesPanel analytics={analytics} />],
  ['Risk', () => <RiskPanel analytics={analytics} />],
  ['Commits', () => <CommitsPanel analytics={analytics} />],

  // Tools
  ['Tools', () => <ToolsPanel analytics={analytics} />],
  ['Flow', () => <FlowPanel analytics={analytics} />],
  ['Errors', () => <ErrorsPanel analytics={analytics} callStats={analytics.tool_call_stats} />],

  // Memory
  ['Health', () => <HealthPanel analytics={analytics} />],
  ['Freshness', () => <FreshnessPanel analytics={analytics} />],
  ['CrossTool', () => <CrossToolPanel analytics={analytics} />],
  ['Authorship', () => <AuthorshipPanel analytics={analytics} />],
  ['Hygiene', () => <HygienePanel analytics={analytics} />],
];

describe('detail-view panels render against baseline analytics', () => {
  for (const [name, render] of cases) {
    it(`${name} mounts without crashing`, () => {
      const { container, unmount } = mount(render());
      expect(container.children.length).toBeGreaterThan(0);
      unmount();
    });
  }
});
