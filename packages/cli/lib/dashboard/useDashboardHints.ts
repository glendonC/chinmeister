import { useMemo } from 'react';
import { isAgentAddressable } from './agent-display.js';
import type { CombinedAgentRow } from './view.js';
import type { UseComposerReturn } from './composer.js';

interface FooterHint {
  key: string;
  label: string;
  color?: string;
}

interface ContextHint {
  commandKey: string;
  label: string;
  color: string;
}

interface DashboardHintsParams {
  isAgentFocusView: boolean;
  focusedAgent: CombinedAgentRow | null;
  showDiagnostics: boolean;
  composer: UseComposerReturn;
  mainSelectedAgent: CombinedAgentRow | null;
}

interface DashboardHintsReturn {
  navItems: FooterHint[];
  contextHints: ContextHint[];
}

/**
 * Builds the navigation hint row and contextual action hints
 * shown in the dashboard footer area.
 */
export function useDashboardHints({
  isAgentFocusView,
  focusedAgent,
  showDiagnostics,
  composer,
  mainSelectedAgent,
}: DashboardHintsParams): DashboardHintsReturn {
  // ── Nav hints ──────────────────────────────────────
  const navItems = useMemo(() => {
    if (isAgentFocusView) {
      const items: FooterHint[] = [{ key: 'esc', label: 'back', color: 'cyan' }];
      if (focusedAgent?._managed && !focusedAgent._dead)
        items.push({ key: 'x', label: 'stop', color: 'red' });
      if (focusedAgent?._managed && focusedAgent._dead) {
        items.push({ key: 'r', label: 'restart', color: 'green' });
        items.push({ key: 'x', label: 'remove', color: 'red' });
      }
      if (isAgentAddressable(focusedAgent))
        items.push({ key: 'm', label: 'message', color: 'cyan' });
      if (focusedAgent?._managed)
        items.push({
          key: 'l',
          label: showDiagnostics ? 'hide diagnostics' : 'diagnostics',
          color: 'yellow',
        });
      return items;
    }
    if (composer.isComposing) {
      return [
        {
          key: 'enter',
          label:
            composer.composeMode === 'memory-add'
              ? 'save'
              : composer.composeMode === 'memory-search'
                ? 'search'
                : 'send',
          color: 'green',
        },
        { key: 'esc', label: 'cancel', color: 'cyan' },
      ];
    }
    return [{ key: 'q', label: 'quit', color: 'gray' }];
  }, [isAgentFocusView, focusedAgent, showDiagnostics, composer.isComposing, composer.composeMode]);

  // ── Contextual hints ───────────────────────────────
  const contextHints = useMemo(() => {
    const hints: ContextHint[] = [];
    if (mainSelectedAgent) {
      hints.push({ commandKey: 'enter', label: 'inspect', color: 'cyan' });
      if (isAgentAddressable(mainSelectedAgent))
        hints.push({ commandKey: 'm', label: 'message', color: 'cyan' });
      if (mainSelectedAgent._managed && !mainSelectedAgent._dead)
        hints.push({ commandKey: 'x', label: 'stop', color: 'red' });
    }
    return hints;
  }, [mainSelectedAgent]);

  return { navItems, contextHints };
}
