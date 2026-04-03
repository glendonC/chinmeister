import { MCP_TOOLS } from '../tools.js';
import { configureTool } from '../mcp-config.js';

/**
 * Attempt to add a tool to the project. Handles MCP-configured tools,
 * install-command tools, and website-only tools.
 *
 * @param {object} tool - Tool object with id, name, installCmd, website
 * @param {string} projectRoot - Absolute path to the project root
 * @returns {{ ok: boolean, message: string }} Result with user-facing message
 */
export function addToolToProject(tool, projectRoot) {
  const mcpTool = MCP_TOOLS.find((t) => t.id === tool.id);
  if (mcpTool) {
    const result = configureTool(projectRoot, tool.id);
    if (result.ok) {
      return { ok: true, message: `Added ${result.name}: ${result.detail}` };
    }
    return { ok: false, message: `Could not add ${result.name || tool.name}: ${result.error}` };
  }
  if (tool.installCmd) {
    return { ok: true, message: `${tool.name} — Install: ${tool.installCmd}  |  ${tool.website}` };
  }
  if (tool.website) {
    return { ok: true, message: `${tool.name} — Visit: ${tool.website}` };
  }
  return { ok: false, message: `${tool.name}: no configuration available` };
}
