import { describe, expect, it } from 'vitest';
import { TOOL_CATALOG } from '../catalog.js';
import { MCP_TOOLS } from '@chinwag/shared/tool-registry.js';

describe('tool catalog', () => {
  it('includes every shared MCP-configurable tool exactly once', () => {
    const catalogIds = TOOL_CATALOG.filter((tool) => tool.mcpConfigurable)
      .map((tool) => tool.id)
      .sort();
    const sharedIds = MCP_TOOLS.map((tool) => tool.id).sort();

    expect(catalogIds).toEqual(sharedIds);
  });

  it('contains only registry-derived entries (no hardcoded discovery tools)', () => {
    for (const tool of TOOL_CATALOG) {
      expect(tool).toHaveProperty('id');
      expect(tool).toHaveProperty('name');
      // All entries should be MCP-compatible (derived from integration model)
      expect(tool.mcpCompatible).toBe(true);
    }
  });
});
