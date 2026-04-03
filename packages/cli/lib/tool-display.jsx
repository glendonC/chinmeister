/**
 * Shared presentation components for tool/integration lists.
 *
 * Used by both customize.jsx and discover.jsx to render detected tools,
 * recommendations, and category browsers without duplicating layout logic.
 */

import React from 'react';
import { Box, Text } from 'ink';

/**
 * Render a list of detected/installed tools with status indicators.
 */
export function DetectedToolsList({ detected, integrationSummary }) {
  if (detected.length === 0) {
    return (
      <Box marginBottom={1}>
        <Text dimColor>No tools detected. Run `npx chinwag init` first.</Text>
      </Box>
    );
  }

  const maxName = Math.max(...detected.map((t) => t.name.length));

  return (
    <>
      <Box flexDirection="column" marginBottom={1}>
        {detected.map((tool) => {
          let detail = tool.mcpConfig;
          if (tool.hooks) detail += ' + hooks';
          if (tool.channel) detail += ' + channel';
          const statusColor =
            tool.status === 'ready'
              ? 'green'
              : tool.status === 'needs_repair'
                ? 'yellow'
                : tool.status === 'needs_setup'
                  ? 'yellow'
                  : 'gray';
          const statusText = tool.status.replace(/_/g, ' ');
          return (
            <Box key={tool.id} flexDirection="column">
              <Text>
                <Text color={tool.status === 'ready' ? 'green' : 'yellow'}>{'● '}</Text>
                <Text>{tool.name.padEnd(maxName + 1)}</Text>
                <Text dimColor>{detail}</Text>
                <Text dimColor> </Text>
                <Text color={statusColor}>{statusText}</Text>
              </Text>
              {tool.issues?.[0] && <Text dimColor> {tool.issues[0]}</Text>}
            </Box>
          );
        })}
      </Box>
      {integrationSummary && (
        <Box marginBottom={1}>
          <Text
            color={
              integrationSummary.tone === 'success'
                ? 'green'
                : integrationSummary.tone === 'warning'
                  ? 'yellow'
                  : 'cyan'
            }
          >
            {integrationSummary.text}
          </Text>
        </Box>
      )}
    </>
  );
}

/**
 * Render a numbered list of recommended tools.
 */
export function RecommendationsList({ recommendations, cols, showVerdict = false }) {
  if (recommendations.length === 0) return null;

  const maxName = Math.max(...recommendations.map((t) => t.name.length));
  const descAvail = cols - 3 - 4 - (maxName + 1) - 6;

  return (
    <Box flexDirection="column" marginBottom={1}>
      {recommendations.map((tool, i) => {
        const desc =
          descAvail > 10 && tool.description.length > descAvail
            ? tool.description.slice(0, descAvail - 1) + '\u2026'
            : tool.description;
        const verdictColor = showVerdict
          ? tool.verdict === 'integrated' || tool.verdict === 'compatible'
            ? 'green'
            : tool.verdict === 'installable' || tool.verdict === 'partial'
              ? 'yellow'
              : undefined
          : undefined;
        return (
          <Text key={tool.id}>
            <Text color="cyan" bold>
              [{i + 1}]
            </Text>
            <Text> {tool.name.padEnd(maxName + 1)}</Text>
            <Text dimColor>{desc}</Text>
            {tool.mcpCompatible && <Text color="green"> [MCP]</Text>}
            {showVerdict && tool.verdict && (
              <Text color={verdictColor} dimColor={!verdictColor}>
                {' '}
                [{tool.verdict}]
              </Text>
            )}
          </Text>
        );
      })}
    </Box>
  );
}

/**
 * Render a category browser with arrow-key navigation.
 */
export function CategoryBrowser({
  categoryKeys,
  selectedCategory,
  categories,
  categoryGroups,
  cols,
}) {
  if (categoryKeys.length === 0) return null;

  return (
    <>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Browse
        </Text>
        {selectedCategory ? <Text dimColor> {'<'}- </Text> : <Text dimColor> </Text>}
        {selectedCategory ? (
          <Text bold>{categories[selectedCategory] || selectedCategory}</Text>
        ) : (
          <Text dimColor>{'press <- -> to browse categories'}</Text>
        )}
        {selectedCategory && categoryKeys.indexOf(selectedCategory) < categoryKeys.length - 1 ? (
          <Text dimColor> {'->'}</Text>
        ) : selectedCategory ? (
          <Text dimColor> </Text>
        ) : null}
        {selectedCategory && (
          <Text dimColor>
            {' '}
            ({categoryKeys.indexOf(selectedCategory) + 1}/{categoryKeys.length})
          </Text>
        )}
      </Box>
      {selectedCategory &&
        categoryGroups[selectedCategory] &&
        (() => {
          const tools = categoryGroups[selectedCategory];
          const maxName = Math.max(...tools.map((t) => t.name.length));
          const descAvail = cols - 4 - 2 - (maxName + 1) - 6;
          return (
            <Box flexDirection="column" paddingLeft={2} marginBottom={1}>
              {tools.map((tool) => {
                const desc =
                  descAvail > 10 && tool.description.length > descAvail
                    ? tool.description.slice(0, descAvail - 1) + '\u2026'
                    : tool.description;
                const verdictColor =
                  tool.verdict === 'integrated' || tool.verdict === 'compatible'
                    ? 'green'
                    : tool.verdict === 'installable' || tool.verdict === 'partial'
                      ? 'yellow'
                      : undefined;
                return (
                  <Text key={tool.id}>
                    <Text dimColor>{'○'}</Text>
                    <Text> {tool.name.padEnd(maxName + 1)}</Text>
                    <Text dimColor>{desc}</Text>
                    {tool.mcpCompatible && <Text color="green"> [MCP]</Text>}
                    {tool.verdict && (
                      <Text color={verdictColor} dimColor={!verdictColor}>
                        {' '}
                        [{tool.verdict}]
                      </Text>
                    )}
                  </Text>
                );
              })}
            </Box>
          );
        })()}
    </>
  );
}
