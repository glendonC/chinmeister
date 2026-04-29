// React binding for demo-only extension fields (see lib/demo/scaffolds.ts).
// Returns null in live mode and for the `empty` scenario, so consumer
// sections can hide cleanly with `if (!extensions) return null;`.

import { useMemo } from 'react';
import { useDemoScenario } from './useDemoScenario.js';
import { getDemoExtensions, type DemoOnlyExtensions } from '../lib/demo/scaffolds.js';

export function useDemoExtensions(): DemoOnlyExtensions | null {
  const demo = useDemoScenario();
  return useMemo(
    () => (demo.active ? getDemoExtensions(demo.scenarioId) : null),
    [demo.active, demo.scenarioId],
  );
}
