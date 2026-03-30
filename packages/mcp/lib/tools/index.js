// MCP tool and resource registration orchestrator.
// Wires together all tool modules and registers them on the MCP server.

import { registerTeamTool } from './team.js';
import { registerActivityTool } from './activity.js';
import { registerConflictsTool } from './conflicts.js';
import { registerContextTool } from './context.js';
import { registerMemoryTools } from './memory.js';
import { registerLockTools } from './locks.js';
import { registerMessagingTool } from './messaging.js';
import { registerIntegrationTools } from './integrations.js';

export function registerTools(server, deps) {
  const addTool = server.registerTool?.bind(server) || server.tool?.bind(server);
  if (!addTool) {
    throw new TypeError('MCP server does not support tool registration');
  }

  registerTeamTool(addTool, deps);
  registerActivityTool(addTool, deps);
  registerConflictsTool(addTool, deps);
  registerContextTool(addTool, deps);
  registerMemoryTools(addTool, deps);
  registerLockTools(addTool, deps);
  registerMessagingTool(addTool, deps);
  registerIntegrationTools(addTool, deps);
}

export function registerResources(server, profile) {
  server.resource(
    'profile',
    'chinwag://profile',
    { description: 'Your agent profile — languages, frameworks, tools detected from your environment.', mimeType: 'application/json' },
    async () => ({
      contents: [{
        uri: 'chinwag://profile',
        mimeType: 'application/json',
        text: JSON.stringify(profile, null, 2),
      }],
    })
  );
}
