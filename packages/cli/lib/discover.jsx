import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import { MCP_TOOLS } from './tools.js';
import { detectTools, configureTool } from './mcp-config.js';
import { api } from './api.js';

const MAX_RECOMMENDATIONS = 9;

export function Discover({ config, navigate }) {
  const [detected, setDetected] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [categories, setCategories] = useState({});
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(true);
  const messageTimer = useRef(null);

  useEffect(() => {
    setDetected(detectTools(process.cwd()));

    // Fetch catalog from API (single source of truth)
    async function fetchCatalog() {
      try {
        const result = await api(config).get('/tools/catalog');
        setCatalog(result.tools || []);
        setCategories(result.categories || {});
      } catch (err) {
        // Fallback: show just detected tools if API is unreachable
        setMessage(`Could not fetch tool catalog: ${err.message}`);
      }
      setLoading(false);
    }
    fetchCatalog();
  }, []);

  useEffect(() => {
    return () => { if (messageTimer.current) clearTimeout(messageTimer.current); };
  }, []);

  const detectedIds = new Set(detected.map(t => t.id));

  // Tools not currently detected/configured, capped for keyboard nav
  const recommendations = catalog
    .filter(t => !detectedIds.has(t.id) && t.featured)
    .slice(0, MAX_RECOMMENDATIONS);

  // Group catalog by category (excluding already-detected tools)
  const categoryGroups = {};
  for (const tool of catalog) {
    if (detectedIds.has(tool.id)) continue;
    const cat = tool.category || 'other';
    if (!categoryGroups[cat]) categoryGroups[cat] = [];
    categoryGroups[cat].push(tool);
  }

  const categoryKeys = Object.keys(categoryGroups);

  function showMessage(text) {
    if (messageTimer.current) clearTimeout(messageTimer.current);
    setMessage(text);
    const duration = Math.max(3000, text.length * 40);
    messageTimer.current = setTimeout(() => setMessage(null), duration);
  }

  useInput((ch, key) => {
    if (ch === 'b' || key.escape) { navigate('home'); return; }
    if (ch === 'q') { navigate('quit'); return; }

    // Number keys to quick-add recommendations
    const num = parseInt(ch, 10);
    if (num >= 1 && num <= recommendations.length) {
      addTool(recommendations[num - 1]);
      return;
    }

    // Category navigation
    if (key.leftArrow || key.rightArrow) {
      if (!selectedCategory) {
        setSelectedCategory(categoryKeys[0] || null);
      } else {
        const idx = categoryKeys.indexOf(selectedCategory);
        if (key.rightArrow && idx < categoryKeys.length - 1) {
          setSelectedCategory(categoryKeys[idx + 1]);
        } else if (key.leftArrow && idx > 0) {
          setSelectedCategory(categoryKeys[idx - 1]);
        }
      }
    }
  });

  function addTool(tool) {
    const mcpTool = MCP_TOOLS.find(t => t.id === tool.id);
    if (mcpTool) {
      const result = configureTool(process.cwd(), tool.id);
      if (result.ok) {
        showMessage(`Added ${result.name}: ${result.detail}`);
        setDetected(detectTools(process.cwd()));
      } else {
        showMessage(`Error: ${result.error}`);
      }
    } else if (tool.installCmd) {
      showMessage(`${tool.name} — Install: ${tool.installCmd}  |  ${tool.website}`);
    } else if (tool.website) {
      showMessage(`${tool.name} — Visit: ${tool.website}`);
    }
  }

  if (loading) {
    return (
      <Box padding={1}>
        <Text color="cyan">Loading tool catalog...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      {/* Your tools */}
      <Box marginBottom={1}>
        <Text bold color="cyan">Your tools</Text>
        <Text dimColor> ({detected.length} configured)</Text>
      </Box>

      {detected.length === 0 ? (
        <Box marginBottom={1} paddingLeft={1}>
          <Text dimColor>No tools detected. Run `chinwag init` first, or `chinwag add {'<tool>'}` to add one.</Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginBottom={1} paddingLeft={1}>
          {detected.map(tool => (
            <Text key={tool.id}>
              <Text color="green">●</Text>
              <Text> {tool.name}</Text>
              <Text dimColor> — {tool.mcpConfig}</Text>
              {tool.hooks && <Text dimColor> + hooks</Text>}
              {tool.channel && <Text dimColor> + channel</Text>}
            </Text>
          ))}
        </Box>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <>
          <Box marginBottom={1}>
            <Text bold color="cyan">Recommended</Text>
          </Box>
          <Box flexDirection="column" marginBottom={1} paddingLeft={1}>
            {recommendations.map((tool, i) => (
              <Text key={tool.id}>
                <Text color="cyan" bold>[{i + 1}]</Text>
                <Text> {tool.name}</Text>
                <Text dimColor> — {tool.description}</Text>
                {tool.mcpCompatible && <Text color="green"> [MCP]</Text>}
              </Text>
            ))}
          </Box>
        </>
      )}

      {/* Browse by category */}
      {categoryKeys.length > 0 && (
        <>
          <Box marginBottom={1}>
            <Text bold color="cyan">Browse</Text>
            <Text dimColor> (← → to navigate categories)</Text>
          </Box>
          <Box paddingLeft={1} marginBottom={1}>
            {categoryKeys.map(cat => (
              <Text key={cat}>
                {selectedCategory === cat ? (
                  <Text color="cyan" bold>[{categories[cat] || cat}]</Text>
                ) : (
                  <Text dimColor> {categories[cat] || cat} </Text>
                )}
                <Text> </Text>
              </Text>
            ))}
          </Box>
        </>
      )}

      {selectedCategory && categoryGroups[selectedCategory] && (
        <Box flexDirection="column" paddingLeft={2} marginBottom={1}>
          {categoryGroups[selectedCategory].map(tool => (
            <Text key={tool.id}>
              <Text dimColor>○</Text>
              <Text> {tool.name}</Text>
              <Text dimColor> — {tool.description}</Text>
              {tool.mcpCompatible && <Text color="green"> [MCP]</Text>}
            </Text>
          ))}
        </Box>
      )}

      {/* Message */}
      {message && (
        <Box paddingLeft={1} marginBottom={1}>
          <Text color="yellow">{message}</Text>
        </Box>
      )}

      {/* Navigation */}
      <Box paddingLeft={1}>
        <Text>
          {recommendations.length > 0 && (
            <><Text color="cyan" bold>[1-{recommendations.length}]</Text><Text dimColor> add  </Text></>
          )}
          <Text color="cyan" bold>[b]</Text><Text dimColor> back  </Text>
          <Text color="cyan" bold>[q]</Text><Text dimColor> quit</Text>
        </Text>
      </Box>
    </Box>
  );
}
