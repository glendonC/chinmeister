import React from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import type { UseComposerReturn } from './composer.js';
import type { UseMemoryManagerReturn } from './memory.js';

interface CommandSuggestion {
  name: string;
  description?: string;
}

export interface InputBarsProps {
  composer: UseComposerReturn;
  memory: UseMemoryManagerReturn;
  commandSuggestions: CommandSuggestion[];
  onComposeSubmit: () => void;
  onMemorySubmit: () => void;
}

/**
 * Renders the input bars for compose modes (command, targeted, memory-search, memory-add).
 */
export function InputBars({
  composer,
  memory,
  commandSuggestions,
  onComposeSubmit,
  onMemorySubmit,
}: InputBarsProps): React.ReactNode {
  return (
    <>
      {composer.composeMode === 'command' &&
        (() => {
          const maxNameLen = Math.max(...commandSuggestions.map((e) => e.name.length), 0);
          return (
            <Box flexDirection="column">
              <Box>
                <Text color="cyan">{'> '}</Text>
                <TextInput
                  value={composer.composeText}
                  onChange={(v: string) => {
                    composer.setComposeText(v);
                    composer.setCommandSelectedIdx(0);
                  }}
                  onSubmit={onComposeSubmit}
                  placeholder="type a command"
                />
              </Box>
              {commandSuggestions.length > 0 && (
                <Box flexDirection="column" marginTop={1}>
                  {commandSuggestions.slice(0, 6).map((entry, idx) => {
                    const sel = idx === composer.commandSelectedIdx;
                    return (
                      <Text key={entry.name}>
                        <Text color={sel ? 'cyan' : 'gray'}>{sel ? '\u203A ' : '  '}</Text>
                        <Text color={sel ? 'cyan' : 'white'}>{entry.name.padEnd(maxNameLen)}</Text>
                        <Text dimColor> {entry.description}</Text>
                      </Text>
                    );
                  })}
                </Box>
              )}
            </Box>
          );
        })()}

      {composer.composeMode === 'targeted' && (
        <Box>
          <Text color="cyan">
            {'@'}
            {composer.composeTargetLabel || 'agent'}{' '}
          </Text>
          <TextInput
            value={composer.composeText}
            onChange={composer.setComposeText}
            onSubmit={onComposeSubmit}
            placeholder="send a message"
          />
        </Box>
      )}

      {composer.composeMode === 'memory-search' && (
        <Box>
          <Text color="yellow">{'search '}</Text>
          <TextInput
            value={memory.memorySearch}
            onChange={memory.setMemorySearch}
            placeholder="search shared knowledge"
          />
        </Box>
      )}

      {composer.composeMode === 'memory-add' && (
        <Box>
          <Text color="green">{'save '}</Text>
          <TextInput
            value={memory.memoryInput}
            onChange={memory.setMemoryInput}
            onSubmit={onMemorySubmit}
            placeholder="save to shared knowledge"
          />
        </Box>
      )}
    </>
  );
}
