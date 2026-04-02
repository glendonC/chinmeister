import {
  MCP_TOOLS,
  type McpTool,
  type ToolCatalog,
  type ToolDetect,
  type ToolProcessDetection,
  type ToolSpawnConfig,
  type ToolAvailabilityCheck,
  type ToolFailurePattern,
} from './tool-registry.js';

export interface HostIntegrationRuntime {
  hostId: string;
  defaultTransport: string;
}

export interface HostIntegration extends McpTool {
  kind: 'host';
  tier: 'managed' | 'connected';
  capabilities: string[];
  displayGroup: string;
  runtime: HostIntegrationRuntime;
}

export interface AgentSurface {
  id: string;
  name: string;
  kind: 'surface';
  supportedHosts: string[];
  capabilities: string[];
  catalog: {
    description: string;
    category: string;
    website: string;
    mcpCompatible?: boolean;
  };
}

export interface CatalogEntry {
  id: string;
  name: string;
  description: string;
  category: string;
  website?: string;
  installCmd?: string;
  mcpCompatible?: boolean;
  mcpConfigurable?: boolean;
  featured?: boolean;
  supportedHosts?: string[];
}

export const HOST_INTEGRATIONS: HostIntegration[] = MCP_TOOLS.map((tool) => {
  const capabilities = [
    'mcp',
    ...(tool.hooks ? ['hooks'] : []),
    ...(tool.channel ? ['channel'] : []),
    ...(tool.spawn ? ['managed-process'] : []),
  ];

  return {
    ...tool,
    kind: 'host',
    tier: tool.tier || (tool.spawn ? 'managed' : 'connected'),
    capabilities,
    displayGroup: 'host',
    runtime: {
      hostId: tool.id,
      defaultTransport: 'mcp',
    },
  };
});

export const AGENT_SURFACES: AgentSurface[] = [
  {
    id: 'cline',
    name: 'Cline',
    kind: 'surface',
    supportedHosts: ['vscode', 'cursor'],
    capabilities: ['mcp'],
    catalog: {
      description: 'Autonomous AI coding agent for VS Code and Cursor',
      category: 'coding-agent',
      website: 'https://cline.bot',
      mcpCompatible: true,
    },
  },
  {
    id: 'continue',
    name: 'Continue',
    kind: 'surface',
    supportedHosts: ['vscode', 'jetbrains'],
    capabilities: ['mcp'],
    catalog: {
      description: 'Open-source AI code assistant for VS Code and JetBrains',
      category: 'coding-agent',
      website: 'https://continue.dev',
      mcpCompatible: true,
    },
  },
  {
    id: 'roo-code',
    name: 'Roo Code',
    kind: 'surface',
    supportedHosts: ['vscode'],
    capabilities: ['mcp'],
    catalog: {
      description: 'Multi-agent AI coding surface for VS Code, forked from Cline',
      category: 'coding-agent',
      website: 'https://roocode.com',
      mcpCompatible: true,
    },
  },
];

export function getHostIntegrationById(hostId: string): HostIntegration | null {
  return HOST_INTEGRATIONS.find((host) => host.id === hostId) || null;
}

export function buildHostIntegrationCatalogEntries(): CatalogEntry[] {
  return HOST_INTEGRATIONS.map((host) => ({
    id: host.id,
    name: host.name,
    ...host.catalog,
  }));
}

export function buildAgentSurfaceCatalogEntries(): CatalogEntry[] {
  return AGENT_SURFACES.map((surface) => ({
    id: surface.id,
    name: surface.name,
    supportedHosts: [...surface.supportedHosts],
    ...surface.catalog,
  }));
}

export type {
  McpTool,
  ToolCatalog,
  ToolDetect,
  ToolProcessDetection,
  ToolSpawnConfig,
  ToolAvailabilityCheck,
  ToolFailurePattern,
};
