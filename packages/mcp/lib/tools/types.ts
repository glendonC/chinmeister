// Shared type definitions for MCP tool modules.

import type { TeamHandlers } from '../team.js';
import type { McpState } from '../lifecycle.js';
import type { EnvironmentProfile } from '../profile.js';
import type { McpToolResult } from '../utils/responses.js';
import type { IntegrationScanResult, ConfigureResult } from '@chinwag/shared/integration-doctor.js';

/** Function signature for registering an MCP tool. */
export type AddToolFn = (
  name: string,
  schema: { description: string; inputSchema: unknown },
  handler: (args: Record<string, unknown>) => Promise<McpToolResult>,
) => void;

/** Integration doctor interface — mirrors shared/integration-doctor.ts exports. */
export interface IntegrationDoctor {
  scanHostIntegrations(cwd: string): IntegrationScanResult[];
  configureHostIntegration(
    cwd: string,
    hostId: string,
    options?: { surfaceId?: string | null },
  ): ConfigureResult;
}

/** Dependencies injected into tool registration functions. */
export interface ToolDeps {
  team: TeamHandlers;
  state: McpState;
  profile: EnvironmentProfile;
  integrationDoctor?: IntegrationDoctor;
}
