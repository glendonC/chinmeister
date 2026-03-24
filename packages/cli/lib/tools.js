// Tool registry — declarative definitions for MCP-configurable tools.
//
// MCP_TOOLS: Tools that chinwag writes MCP config for. Each entry defines
// detection rules (dirs/cmds), config file path, and integration depth.
// Adding a new tool = adding one entry here. No logic changes elsewhere.
//
// The full discovery catalog (30+ tools) lives in the worker API at
// GET /tools/catalog — CLI and web fetch it dynamically.

export const MCP_TOOLS = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    detect: { dirs: ['.claude'], cmds: ['claude'] },
    mcpConfig: '.mcp.json',
    hooks: true,
    channel: true,
  },
  {
    id: 'cursor',
    name: 'Cursor',
    detect: { dirs: ['.cursor'], cmds: ['cursor'] },
    mcpConfig: '.cursor/mcp.json',
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    detect: { dirs: ['.windsurf'], cmds: ['windsurf'] },
    mcpConfig: '.windsurf/mcp.json',
  },
  {
    id: 'vscode',
    name: 'VS Code',
    detect: { dirs: ['.vscode'], cmds: ['code'] },
    mcpConfig: '.vscode/mcp.json',
  },
  {
    id: 'codex',
    name: 'Codex',
    detect: { cmds: ['codex'] },
    mcpConfig: '.mcp.json',
  },
  {
    id: 'aider',
    name: 'Aider',
    detect: { cmds: ['aider'] },
    mcpConfig: '.mcp.json',
  },
  {
    id: 'jetbrains',
    name: 'JetBrains',
    detect: { dirs: ['.idea'], cmds: ['idea', 'pycharm', 'webstorm', 'phpstorm', 'goland', 'rubymine', 'rider', 'clion'] },
    mcpConfig: '.idea/mcp.json',
  },
  {
    id: 'amazon-q',
    name: 'Amazon Q',
    detect: { cmds: ['q'] },
    mcpConfig: '.mcp.json',
  },
];
