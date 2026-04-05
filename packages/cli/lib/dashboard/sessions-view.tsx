import React from 'react';
import { Box, Text } from 'ink';
import { HintRow, NoticeLine } from './ui.jsx';
import { SessionsPanel } from './sections.jsx';
import { InputBars } from './input-bars.jsx';
import { getAgentIntent } from './agent-display.js';
import type { CombinedAgentRow } from './view.js';
import type { DashboardState, DashboardNotice } from './reducer.js';
import type { UseComposerReturn } from './composer.js';
import type { UseMemoryManagerReturn } from './memory.js';

interface CommandSuggestion {
  name: string;
  description?: string;
}

interface CommandBarProps {
  composer: UseComposerReturn;
  memory: UseMemoryManagerReturn;
  notice: DashboardNotice | null;
  view: 'memory' | 'sessions';
  commandSuggestions: CommandSuggestion[];
  onComposeSubmit: () => void;
  onMemorySubmit: () => void;
}

/**
 * Renders the command bar with input bars, notice line, and hint row.
 */
function CommandBar({
  composer,
  memory,
  notice,
  view,
  commandSuggestions,
  onComposeSubmit,
  onMemorySubmit,
}: CommandBarProps): React.ReactNode {
  const isMemoryView = view === 'memory';
  const isSessionsView = view === 'sessions';

  return (
    <Box paddingX={1} paddingTop={1} flexDirection="column">
      <Box
        borderStyle="round"
        borderColor={composer.isComposing ? 'cyan' : 'gray'}
        paddingX={1}
        flexDirection="column"
      >
        <InputBars
          composer={composer}
          memory={memory}
          commandSuggestions={commandSuggestions}
          onComposeSubmit={onComposeSubmit}
          onMemorySubmit={onMemorySubmit}
        />
        {!composer.isComposing && <Text dimColor> {'>'} Press / for commands</Text>}
      </Box>
      <NoticeLine notice={notice} />
      <Box paddingTop={1}>
        <HintRow
          hints={
            isMemoryView
              ? [
                  { commandKey: '/', label: 'search', color: 'cyan' },
                  { commandKey: 'a', label: 'add', color: 'green' },
                  ...(memory.memorySelectedIdx >= 0
                    ? [{ commandKey: 'd', label: 'delete', color: 'red' }]
                    : []),
                  { commandKey: 'esc', label: 'back', color: 'cyan' },
                  { commandKey: 'q', label: 'quit', color: 'gray' },
                ]
              : [
                  ...(isSessionsView
                    ? [{ commandKey: '\u2191\u2193', label: 'select', color: 'cyan' }]
                    : []),
                  { commandKey: 'q', label: 'quit', color: 'gray' },
                ]
          }
        />
      </Box>
    </Box>
  );
}

export interface SessionsViewProps {
  liveAgents: CombinedAgentRow[];
  visibleSessionRows: { items: CombinedAgentRow[]; start: number };
  state: DashboardState;
  cols: number;
  composer: UseComposerReturn;
  memory: UseMemoryManagerReturn;
  commandSuggestions: CommandSuggestion[];
  onComposeSubmit: () => void;
  onMemorySubmit: () => void;
}

/**
 * Renders the sessions view.
 */
export function SessionsView({
  liveAgents,
  visibleSessionRows,
  state,
  cols,
  composer,
  memory,
  commandSuggestions,
  onComposeSubmit,
  onMemorySubmit,
}: SessionsViewProps): React.ReactNode {
  const { selectedIdx, notice } = state;
  return (
    <Box flexDirection="column">
      <Box flexDirection="column" paddingTop={1}>
        <Text color="green" bold>
          sessions
        </Text>
        <Text dimColor>
          {liveAgents.length} live session{liveAgents.length === 1 ? '' : 's'} across managed and
          connected agents.
        </Text>
      </Box>

      <SessionsPanel
        liveAgents={visibleSessionRows.items}
        totalCount={liveAgents.length}
        windowStart={visibleSessionRows.start}
        selectedIdx={selectedIdx}
        getAgentIntent={getAgentIntent}
        cols={cols}
      />

      <CommandBar
        composer={composer}
        memory={memory}
        notice={notice}
        view="sessions"
        commandSuggestions={commandSuggestions}
        onComposeSubmit={onComposeSubmit}
        onMemorySubmit={onMemorySubmit}
      />
    </Box>
  );
}
