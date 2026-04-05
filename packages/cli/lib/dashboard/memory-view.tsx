import React from 'react';
import { Box, Text } from 'ink';
import { HintRow, NoticeLine } from './ui.jsx';
import { KnowledgePanel } from './sections.jsx';
import { InputBars } from './input-bars.jsx';
import type { MemoryEntry } from './view.js';
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

export interface MemoryViewProps {
  memories: MemoryEntry[];
  filteredMemories: MemoryEntry[];
  visibleKnowledgeRows: { items: MemoryEntry[]; start: number };
  memory: UseMemoryManagerReturn;
  composer: UseComposerReturn;
  state: DashboardState;
  commandSuggestions: CommandSuggestion[];
  onComposeSubmit: () => void;
  onMemorySubmit: () => void;
}

/**
 * Renders the memory view.
 */
export function MemoryView({
  memories,
  filteredMemories,
  visibleKnowledgeRows,
  memory,
  composer,
  state,
  commandSuggestions,
  onComposeSubmit,
  onMemorySubmit,
}: MemoryViewProps): React.ReactNode {
  const { notice } = state;
  return (
    <Box flexDirection="column">
      <Box flexDirection="column" paddingTop={1}>
        <Text color="magenta" bold>
          memory
        </Text>
        <Text dimColor>Shared memory across your agents and teammates.</Text>
      </Box>

      <KnowledgePanel
        memories={memories}
        filteredMemories={filteredMemories}
        knowledgeVisible={visibleKnowledgeRows.items}
        windowStart={visibleKnowledgeRows.start}
        memorySearch={memory.memorySearch}
        memorySelectedIdx={memory.memorySelectedIdx}
        deleteConfirm={memory.deleteConfirm}
        deleteMsg={memory.deleteMsg}
      />

      <CommandBar
        composer={composer}
        memory={memory}
        notice={notice}
        view="memory"
        commandSuggestions={commandSuggestions}
        onComposeSubmit={onComposeSubmit}
        onMemorySubmit={onMemorySubmit}
      />
    </Box>
  );
}
