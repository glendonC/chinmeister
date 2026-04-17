/**
 * Tool selection & cycling logic: remembering the preferred launch tool,
 * selecting/cycling through available tools, resolving tool queries,
 * and refreshing tool state.
 */
import type { ManagedTool, ManagedToolState } from '../../managed-agents.js';
import { saveLauncherPreference } from '../../launcher-preferences.js';
import type { NoticeTone } from '../reducer.js';
import type { UseManagedAgentsReturn } from './useManagedAgents.js';
import type { UseToolAvailabilityReturn } from './useToolAvailability.js';

interface UseToolSelectorParams {
  teamId: string | null;
  tools: UseToolAvailabilityReturn;
  managed: UseManagedAgentsReturn;
  flash: (text: string, options?: { tone?: NoticeTone }) => void;
}

export interface UseToolSelectorReturn {
  rememberLaunchTool: (toolId: string) => void;
  selectLaunchTool: (tool: ManagedTool) => void;
  cycleToolForward: () => void;
  resolveReadyTool: (query: string) => ManagedTool | null;
  refreshManagedToolStates: (options?: { clearRuntimeFailures?: boolean }) => void;
}

export function useToolSelector({
  teamId,
  tools,
  managed,
  flash,
}: UseToolSelectorParams): UseToolSelectorReturn {
  function rememberLaunchTool(toolId: string): void {
    if (!teamId || !toolId) return;
    if (saveLauncherPreference(teamId, toolId)) {
      tools.setPreferredLaunchToolId(toolId);
    }
  }

  function selectLaunchTool(tool: ManagedTool): void {
    if (!tool) return;
    tools.setLaunchToolId(tool.id);
  }

  function cycleToolForward(): void {
    if (tools.launcherChoices.length <= 1) return;
    const currentIdx = tools.launcherChoices.findIndex((t) => t.id === tools.launchToolId);
    const nextIdx = (currentIdx + 1) % tools.launcherChoices.length;
    const nextTool = tools.launcherChoices[nextIdx];
    if (nextTool) tools.setLaunchToolId(nextTool.id);
  }

  function resolveReadyTool(query: string): ManagedTool | null {
    if (!query) return null;
    const normalized = query.toLowerCase();
    return (
      tools.readyCliAgents.find(
        (tool) =>
          tool.id === normalized ||
          tool.name.toLowerCase() === normalized ||
          tool.name.toLowerCase().startsWith(normalized) ||
          tool.id.startsWith(normalized),
      ) || null
    );
  }

  function refreshManagedToolStates({ clearRuntimeFailures = false } = {}): void {
    managed.setManagedToolStates((prev) => {
      if (!clearRuntimeFailures) return prev;
      const next: Record<string, ManagedToolState> = {};
      for (const [toolId, status] of Object.entries(prev)) {
        if (status?.source !== 'runtime') next[toolId] = status;
      }
      return next;
    });
    managed.setManagedToolStatusTick((tick) => tick + 1);
    flash('Rechecking tools...', { tone: 'info' });
  }

  return {
    rememberLaunchTool,
    selectLaunchTool,
    cycleToolForward,
    resolveReadyTool,
    refreshManagedToolStates,
  };
}
