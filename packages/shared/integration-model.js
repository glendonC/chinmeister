import { MCP_TOOLS } from './tool-registry.js';

export const HOST_INTEGRATIONS = MCP_TOOLS.map((tool) => {
  const capabilities = [
    'mcp',
    ...(tool.hooks ? ['hooks'] : []),
    ...(tool.channel ? ['channel'] : []),
    ...(tool.spawn ? ['managed-process'] : []),
  ];

  return {
    ...tool,
    kind: 'host',
    tier: tool.spawn ? 'managed' : 'connected',
    capabilities,
    displayGroup: 'host',
    runtime: {
      hostId: tool.id,
      defaultTransport: 'mcp',
    },
  };
});

export const AGENT_SURFACES = [
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

export function getHostIntegrationById(hostId) {
  return HOST_INTEGRATIONS.find((host) => host.id === hostId) || null;
}

export function buildHostIntegrationCatalogEntries() {
  return HOST_INTEGRATIONS.map((host) => ({
    id: host.id,
    name: host.name,
    ...host.catalog,
  }));
}

export function buildAgentSurfaceCatalogEntries() {
  return AGENT_SURFACES.map((surface) => ({
    id: surface.id,
    name: surface.name,
    supportedHosts: [...surface.supportedHosts],
    ...surface.catalog,
  }));
}
