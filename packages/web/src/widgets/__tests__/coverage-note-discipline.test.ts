import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, it, expect } from 'vitest';

import { WIDGET_CATALOG } from '../widget-catalog.js';
import type { WidgetCategory } from '../catalog/types.js';

// Static check: every catalog entry that declares `requiredCapability` must
// have a matching widget body file that references `CoverageNote`. The helper
// `capabilityCoverageNote` returns null on full coverage, so an unconditional
// `<CoverageNote text={...} />` is a safe no-op when no disclosure is needed.
// Bodies are expected to render it in every branch (empty + populated).
const HERE = dirname(fileURLToPath(import.meta.url));
const BODIES_DIR = resolve(HERE, '..', 'bodies');

// Per-category body file. Mirrors `bodies/registry.ts`. A widget category that
// gets its own body file in the future needs an entry here.
const BODY_FILE_BY_CATEGORY: Record<WidgetCategory, string> = {
  live: 'LiveWidgets.tsx',
  usage: 'UsageWidgets.tsx',
  outcomes: 'OutcomeWidgets.tsx',
  activity: 'ActivityWidgets.tsx',
  codebase: 'CodebaseWidgets.tsx',
  tools: 'ToolWidgets.tsx',
  conversations: 'ConversationWidgets.tsx',
  memory: 'MemoryWidgets.tsx',
  team: 'TeamWidgets.tsx',
};

describe('coverage-note discipline', () => {
  it('every requiredCapability widget body references CoverageNote', () => {
    const offenders: Array<{ id: string; file: string }> = [];
    for (const def of WIDGET_CATALOG) {
      if (!def.requiredCapability) continue;
      const fileName = BODY_FILE_BY_CATEGORY[def.category];
      const path = resolve(BODIES_DIR, fileName);
      const contents = readFileSync(path, 'utf8');
      if (!contents.includes('CoverageNote')) {
        offenders.push({ id: def.id, file: path });
      }
    }
    expect(offenders).toEqual([]);
  });
});
