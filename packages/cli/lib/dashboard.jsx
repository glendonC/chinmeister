import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import { existsSync, readFileSync } from 'fs';
import { basename, join } from 'path';
import { api } from './api.js';
import { getInkColor } from './colors.js';
import { detectTools } from './mcp-config.js';
import { openDashboard } from './open-dashboard.js';
import { pingAgentTerminal } from '../../shared/session-registry.js';

let PKG_VERSION = '0.1.0';
try {
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'));
  PKG_VERSION = pkg.version;
} catch { /* fallback */ }

const MIN_WIDTH = 50;
const MAX_AGENTS = 5;
const MAX_MEMORIES = 8;
const MEMORY_CATEGORIES = [null, 'gotcha', 'pattern', 'config', 'decision', 'reference'];
const CATEGORY_COLORS = { gotcha: 'yellow', pattern: 'magenta', config: 'blue', decision: 'green', reference: 'gray' };

export function Dashboard({ config, user, navigate }) {
  const { stdout } = useStdout();
  const [cols, setCols] = useState(stdout?.columns || 80);
  const [teamId, setTeamId] = useState(null);
  const [teamName, setTeamName] = useState(null);
  const [detectedTools, setDetectedTools] = useState([]);
  const [context, setContext] = useState(null);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const [flashMsg, setFlashMsg] = useState(null);

  // Memory management
  const [memoryFilter, setMemoryFilter] = useState(null);
  const [memorySelectedIdx, setMemorySelectedIdx] = useState(-1);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState(null);

  // Section focus: 'agents' | 'memory'
  const [activeSection, setActiveSection] = useState('agents');

  useEffect(() => {
    if (!stdout) return;
    const onResize = () => setCols(stdout.columns);
    stdout.on('resize', onResize);
    return () => stdout.off('resize', onResize);
  }, [stdout]);

  useEffect(() => {
    const cwd = process.cwd();
    const chinwagFile = join(cwd, '.chinwag');
    if (!existsSync(chinwagFile)) {
      setError('No .chinwag file found. Run `npx chinwag init` first.');
      return;
    }
    try {
      const data = JSON.parse(readFileSync(chinwagFile, 'utf-8'));
      if (!data.team) {
        setError('Invalid .chinwag file — missing team ID.');
        return;
      }
      setTeamId(data.team);
      setTeamName(data.name || data.team);
    } catch {
      setError('Could not read .chinwag file.');
    }

    try {
      setDetectedTools(detectTools(cwd));
    } catch {}
  }, []);

  useEffect(() => {
    if (!teamId) return;
    const client = api(config);
    let joined = false;

    async function fetchContext() {
      try {
        if (!joined) {
          await client.post(`/teams/${teamId}/join`, { name: teamName }).catch(() => {});
          joined = true;
        }
        const ctx = await client.get(`/teams/${teamId}/context`);
        setContext(ctx);
        setError(null);
      } catch (err) {
        if (err.message?.includes('Not a member')) joined = false;
        setError(`Failed to fetch: ${err.message}`);
      }
    }

    fetchContext();
    const interval = setInterval(fetchContext, 5000);
    return () => clearInterval(interval);
  }, [teamId, teamName, refreshKey, config?.token]);

  useInput((input, key) => {
    // Tab switches section focus
    if (key.tab) {
      setActiveSection(prev => prev === 'agents' ? 'memory' : 'agents');
      setSelectedIdx(-1);
      setMemorySelectedIdx(-1);
      setDeleteConfirm(false);
      return;
    }

    // Section-specific arrow navigation
    if (activeSection === 'agents') {
      if (key.downArrow && visibleAgents.length > 0) {
        setSelectedIdx(prev => Math.min(prev + 1, visibleAgents.length - 1));
        return;
      }
      if (key.upArrow) {
        setSelectedIdx(prev => prev <= 0 ? -1 : prev - 1);
        return;
      }
      if (key.escape) { setSelectedIdx(-1); return; }
      if (key.return && selectedIdx >= 0 && selectedIdx < visibleAgents.length) {
        const agent = visibleAgents[selectedIdx];
        if (pingAgentTerminal(agent.agent_id)) {
          setFlashMsg('Pinged — check your terminal tabs');
        } else {
          setFlashMsg('Terminal not found');
        }
        setTimeout(() => setFlashMsg(null), 3000);
        return;
      }
    }

    if (activeSection === 'memory') {
      if (key.downArrow && filteredMemories.length > 0) {
        setMemorySelectedIdx(prev => Math.min(prev + 1, filteredMemories.length - 1));
        setDeleteConfirm(false);
        return;
      }
      if (key.upArrow) {
        setMemorySelectedIdx(prev => prev <= 0 ? -1 : prev - 1);
        setDeleteConfirm(false);
        return;
      }
      if (key.escape) {
        if (deleteConfirm) { setDeleteConfirm(false); return; }
        setMemorySelectedIdx(-1);
        return;
      }
    }

    // Memory filter: [m] cycles categories
    if (input === 'm') {
      const currentIdx = MEMORY_CATEGORIES.indexOf(memoryFilter);
      const nextIdx = (currentIdx + 1) % MEMORY_CATEGORIES.length;
      setMemoryFilter(MEMORY_CATEGORIES[nextIdx]);
      setMemorySelectedIdx(-1);
      setDeleteConfirm(false);
      return;
    }

    // Memory delete: [d] on selected memory
    if (input === 'd' && activeSection === 'memory' && memorySelectedIdx >= 0) {
      if (!deleteConfirm) {
        setDeleteConfirm(true);
        return;
      }
      // Confirmed — delete
      const mem = filteredMemories[memorySelectedIdx];
      if (mem?.id && teamId) {
        const client = api(config);
        client.del(`/teams/${teamId}/memory`, { id: mem.id }).then(() => {
          setDeleteMsg('Memory deleted');
          setDeleteConfirm(false);
          setMemorySelectedIdx(-1);
          setRefreshKey(k => k + 1);
          setTimeout(() => setDeleteMsg(null), 2000);
        }).catch(() => {
          setDeleteMsg('Delete failed');
          setDeleteConfirm(false);
          setTimeout(() => setDeleteMsg(null), 2000);
        });
      }
      return;
    }

    if (input === 'q') { navigate('quit'); return; }
    if (input === 'r') {
      setContext(null);
      setRefreshKey(k => k + 1);
    }
    if (input === 'w') { openDashboard().catch(() => {}); return; }
    if (input === 'f') { navigate('discover'); return; }
    if (input === 'c') { navigate('chat'); return; }
    if (input === 's') { navigate('customize'); return; }
  });

  // ── Helpers ────────────────────────────────────────────

  // Tool name lookup: 'claude-code' → 'Claude Code'
  const toolNameMap = new Map(detectedTools.map(t => [t.id, t.name]));
  const getToolName = (toolId) => {
    if (!toolId || toolId === 'unknown') return null;
    return toolNameMap.get(toolId) || toolId;
  };

  const fmtDur = (mins) => {
    if (mins == null) return null;
    return mins >= 60
      ? `${Math.floor(mins / 60)}h ${Math.round(mins % 60)}m`
      : `${Math.round(mins)}m`;
  };

  // Format file list: short basenames, cap at 3
  const fmtFiles = (files) => {
    if (!files?.length) return null;
    const names = files.map(f => basename(f));
    if (names.length <= 3) return names.join(', ');
    return `${names[0]}, ${names[1]} + ${names.length - 2} more`;
  };

  // Filter out summaries that just restate the file path
  const smartSummary = (activity) => {
    if (!activity?.summary) return null;
    const s = activity.summary;
    if (/^editing\s/i.test(s)) return null;
    if (activity.files?.length === 1 && s.toLowerCase().includes(basename(activity.files[0]).toLowerCase())) return null;
    return s;
  };

  // ── Computed values ────────────────────────────────────

  const userColor = getInkColor(user?.color);
  const projectDir = teamName || basename(process.cwd());
  const dividerWidth = Math.min(cols - 4, 50);

  const members = context?.members || [];
  // Only show members with a real tool identity — filters out TUI/CLI auth entries
  const activeAgents = members.filter(m => m.status === 'active' && m.tool && m.tool !== 'unknown');
  const agentsWithWork = activeAgents.filter(m => m.activity?.files?.length > 0);

  // Team mode: show handles only when multiple people are present
  const uniqueHandles = new Set(activeAgents.map(m => m.handle));
  const isTeam = uniqueHandles.size > 1;

  // Conflicts
  const fileOwners = new Map();
  for (const m of agentsWithWork) {
    const label = getToolName(m.tool) ? `${m.handle} (${getToolName(m.tool)})` : m.handle;
    for (const f of m.activity.files) {
      if (!fileOwners.has(f)) fileOwners.set(f, []);
      fileOwners.get(f).push(label);
    }
  }
  const conflicts = [...fileOwners.entries()].filter(([, owners]) => owners.length > 1);

  // Memory — with category filtering
  const memories = context?.memories || [];
  const filteredMemories = memoryFilter
    ? memories.filter(m => m.category === memoryFilter)
    : memories;
  const visibleMemories = filteredMemories.slice(0, MAX_MEMORIES);
  const memoryOverflow = filteredMemories.length - MAX_MEMORIES;

  // Messages
  const messages = context?.messages || [];

  // Telemetry
  const toolsConfigured = context?.tools_configured || [];
  const usage = context?.usage || {};

  // Recent sessions — only when no live agents
  const recentSessions = (context?.recentSessions || []).filter(s => {
    if (s.ended_at && !s.edit_count && !(s.files_touched?.length)) return false;
    return true;
  });
  const showRecent = recentSessions.length > 0 && activeAgents.length === 0;

  // Agents to display — capped
  const visibleAgents = activeAgents.slice(0, MAX_AGENTS);
  const agentOverflow = activeAgents.length - MAX_AGENTS;

  useEffect(() => {
    if (selectedIdx >= visibleAgents.length) {
      setSelectedIdx(visibleAgents.length > 0 ? visibleAgents.length - 1 : -1);
    }
  }, [selectedIdx, visibleAgents.length]);

  useEffect(() => {
    if (memorySelectedIdx >= visibleMemories.length) {
      setMemorySelectedIdx(visibleMemories.length > 0 ? visibleMemories.length - 1 : -1);
    }
  }, [memorySelectedIdx, visibleMemories.length]);

  // Detect duplicate tool types for agent disambiguation
  const toolCounts = new Map();
  for (const a of activeAgents) {
    toolCounts.set(a.tool, (toolCounts.get(a.tool) || 0) + 1);
  }
  const shortId = (agentId) => {
    if (!agentId) return '';
    const parts = agentId.split(':');
    if (parts.length >= 3) return parts[2].slice(0, 4);
    return '';
  };

  // ── Layout pieces ──────────────────────────────────────

  const splashHeader = (
    <Box borderStyle="round" paddingX={1} marginX={1} marginTop={1} flexDirection="column">
      <Text>
        <Text color="cyan" bold>chinwag</Text>
        <Text dimColor>  v{PKG_VERSION}</Text>
      </Text>
      <Text>
        <Text color={userColor} bold>@{user?.handle || 'unknown'}</Text>
        <Text dimColor>  ·  {projectDir}</Text>
      </Text>
    </Box>
  );

  // Dynamic nav bar based on active section
  const navBar = (
    <Box paddingX={1} paddingTop={1} flexDirection="column">
      <Text>
        <Text color="cyan" bold>[Tab]</Text><Text dimColor> {activeSection === 'agents' ? 'memory' : 'agents'}  </Text>
        <Text color="cyan" bold>[w]</Text><Text dimColor> browser  </Text>
        <Text color="cyan" bold>[f]</Text><Text dimColor> discover  </Text>
        <Text color="cyan" bold>[c]</Text><Text dimColor> chat  </Text>
        <Text color="cyan" bold>[s]</Text><Text dimColor> settings  </Text>
        <Text color="cyan" bold>[q]</Text><Text dimColor> quit</Text>
      </Text>
      {activeSection === 'memory' && (
        <Text>
          <Text color="cyan" bold>[m]</Text><Text dimColor> filter  </Text>
          {memorySelectedIdx >= 0 && (
            <>
              <Text color="cyan" bold>[d]</Text><Text dimColor> delete  </Text>
            </>
          )}
          <Text dimColor>↑↓ select</Text>
        </Text>
      )}
    </Box>
  );

  // ── Guards ─────────────────────────────────────────────

  if (cols < MIN_WIDTH) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan" bold>chinwag</Text>
        <Text>{''}</Text>
        <Text dimColor>Terminal too narrow ({cols} cols).</Text>
        <Text dimColor>Widen to at least {MIN_WIDTH}.</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column">
        {splashHeader}
        <Box paddingX={1} paddingTop={1}>
          <Text color="red">{error}</Text>
        </Box>
        {navBar}
      </Box>
    );
  }

  if (!context) {
    return (
      <Box flexDirection="column">
        {splashHeader}
        <Box paddingX={1} paddingTop={1}>
          <Text dimColor>Connecting...</Text>
        </Box>
        {navBar}
      </Box>
    );
  }

  // ── Main render ────────────────────────────────────────

  return (
    <Box flexDirection="column">
      {splashHeader}

      {/* Agents — the core section, always visible */}
      <Box flexDirection="column" paddingX={1} paddingTop={1}>
        <Text>
          <Text bold>Agents</Text>
          {activeSection === 'agents' && <Text color="cyan"> *</Text>}
          {activeAgents.length > 0 && (
            <Text dimColor>  {activeAgents.length} running  ↑↓</Text>
          )}
        </Text>
        <Text dimColor>{'─'.repeat(dividerWidth)}</Text>
        {activeAgents.length === 0 ? (
          <Text dimColor>  No agents running. Start an AI tool to see it here.</Text>
        ) : (
          <>
            {visibleAgents.map((m, idx) => {
              const toolName = getToolName(m.tool);
              const dur = fmtDur(m.session_minutes);
              const showShortId = toolCounts.get(m.tool) > 1;
              const isSelected = activeSection === 'agents' && idx === selectedIdx;
              const allFiles = m.activity?.files || [];
              const files = fmtFiles(allFiles);
              const summary = smartSummary(m.activity);

              return (
                <Box key={m.agent_id || m.handle} flexDirection="column">
                  <Text>
                    {isSelected
                      ? <Text color="cyan">  ▸ </Text>
                      : <Text color="green">  ● </Text>
                    }
                    <Text bold>{toolName || 'Unknown'}</Text>
                    {showShortId && <Text dimColor> #{shortId(m.agent_id)}</Text>}
                    {isTeam && <Text dimColor>  {m.handle}</Text>}
                    {dur && <Text dimColor>  {dur}</Text>}
                  </Text>
                  {isSelected ? (
                    <Box flexDirection="column">
                      {allFiles.length > 0
                        ? allFiles.map(f => (
                            <Text key={f} dimColor>{'      '}{basename(f)}</Text>
                          ))
                        : <Text dimColor>{'      '}No activity reported yet</Text>
                      }
                      {m.activity?.summary && !/^editing\s/i.test(m.activity.summary) && (
                        <Text dimColor>{'      '}"{m.activity.summary}"</Text>
                      )}
                    </Box>
                  ) : (files || summary) ? (
                    <Text dimColor>
                      {'    '}
                      {files || ''}
                      {files && summary ? ` — "${summary}"` : ''}
                      {!files && summary ? `"${summary}"` : ''}
                    </Text>
                  ) : null}
                </Box>
              );
            })}
            {agentOverflow > 0 && (
              <Text dimColor>  + {agentOverflow} more — <Text color="cyan" bold>[w]</Text> to see all</Text>
            )}
          </>
        )}
        {flashMsg && (
          <Text dimColor>  {flashMsg}</Text>
        )}
      </Box>

      {/* Conflicts — only when agents overlap on files */}
      {conflicts.length > 0 && (
        <Box flexDirection="column" paddingX={1} paddingTop={1}>
          <Text color="red" bold>Conflicts</Text>
          <Text dimColor>{'─'.repeat(dividerWidth)}</Text>
          {conflicts.map(([file, owners]) => (
            <Text key={file}>
              <Text color="red">  ! {basename(file)}</Text>
              <Text dimColor> — {owners.join(' & ')}</Text>
            </Text>
          ))}
        </Box>
      )}

      {/* Messages — show if any exist */}
      {messages.length > 0 && (
        <Box flexDirection="column" paddingX={1} paddingTop={1}>
          <Text>
            <Text bold>Messages</Text>
            <Text dimColor>  {messages.length} recent</Text>
          </Text>
          <Text dimColor>{'─'.repeat(dividerWidth)}</Text>
          {messages.slice(0, 5).map((msg, i) => {
            const from = msg.from_tool && msg.from_tool !== 'unknown'
              ? `${msg.from_handle} (${msg.from_tool})`
              : msg.from_handle;
            return (
              <Text key={i}>
                <Text color="blue">  {from}</Text>
                <Text dimColor>  {msg.text}</Text>
              </Text>
            );
          })}
          {messages.length > 5 && (
            <Text dimColor>  + {messages.length - 5} more</Text>
          )}
        </Box>
      )}

      {/* Memory — project knowledge saved by agents */}
      <Box flexDirection="column" paddingX={1} paddingTop={1}>
        <Text>
          <Text bold>Memory</Text>
          {activeSection === 'memory' && <Text color="cyan"> *</Text>}
          {memories.length > 0 && <Text dimColor>  {memories.length} saved</Text>}
          {memoryFilter && <Text color="yellow">  [{memoryFilter}]</Text>}
        </Text>
        <Text dimColor>{'─'.repeat(dividerWidth)}</Text>
        {filteredMemories.length === 0 ? (
          <Text dimColor>
            {memoryFilter
              ? `  No ${memoryFilter} memories. [m] to change filter.`
              : '  None yet — agents save gotchas, configs, patterns, and decisions here.'}
          </Text>
        ) : (
          <>
            {visibleMemories.map((mem, idx) => {
              const prefix = `  [${mem.category}]  `;
              const maxText = cols - prefix.length - 4;
              const text = mem.text.length > maxText ? mem.text.slice(0, maxText - 1) + '…' : mem.text;
              const isMemSelected = activeSection === 'memory' && idx === memorySelectedIdx;
              const catColor = CATEGORY_COLORS[mem.category] || 'gray';
              return (
                <Text key={mem.id || idx}>
                  {isMemSelected
                    ? <Text color="cyan">  ▸ </Text>
                    : <Text>{'  '}</Text>
                  }
                  <Text color={catColor}>[{mem.category}]</Text>
                  <Text>  {text}</Text>
                  {isMemSelected && mem.source_handle && (
                    <Text dimColor>  — {mem.source_handle}</Text>
                  )}
                </Text>
              );
            })}
            {memoryOverflow > 0 && (
              <Text dimColor>  + {memoryOverflow} more — <Text color="cyan" bold>[w]</Text> to browse all</Text>
            )}
          </>
        )}
        {deleteConfirm && (
          <Text color="red">  Press [d] again to confirm delete, [Esc] to cancel</Text>
        )}
        {deleteMsg && (
          <Text dimColor>  {deleteMsg}</Text>
        )}
      </Box>

      {/* Stats — compact telemetry when data exists */}
      {(toolsConfigured.length > 0 || Object.keys(usage).length > 0) && (
        <Box flexDirection="column" paddingX={1} paddingTop={1}>
          <Text bold>Stats</Text>
          <Text dimColor>{'─'.repeat(dividerWidth)}</Text>
          <Text>
            {'  '}
            {usage.conflict_checks > 0 && (
              <Text dimColor>Checks: {usage.conflict_checks}  </Text>
            )}
            {usage.conflicts_found > 0 && (
              <Text color="red">Found: {usage.conflicts_found}  </Text>
            )}
            {usage.memories_saved > 0 && (
              <Text dimColor>Saved: {usage.memories_saved}  </Text>
            )}
            {usage.messages_sent > 0 && (
              <Text dimColor>Msgs: {usage.messages_sent}</Text>
            )}
          </Text>
          {toolsConfigured.length > 0 && (
            <Text dimColor>
              {'  Tools: '}
              {toolsConfigured.map(t => `${t.tool} (${t.joins})`).join(', ')}
            </Text>
          )}
        </Box>
      )}

      {/* Recent — past work, only when no agents are live */}
      {showRecent && (
        <Box flexDirection="column" paddingX={1} paddingTop={1}>
          <Text bold>Recent</Text>
          <Text dimColor>{'─'.repeat(dividerWidth)}</Text>
          {recentSessions.slice(0, 5).map(s => {
            const dur = fmtDur(s.duration_minutes) || '0m';
            const fileCount = s.files_touched?.length || 0;
            const hasActivity = s.edit_count > 0 || fileCount > 0;
            const toolName = s.tool ? getToolName(s.tool) : null;
            return (
              <Text key={`${s.owner_handle}-${s.started_at}`}>
                <Text>  {toolName || 'Agent'}</Text>
                <Text dimColor>  {s.owner_handle}</Text>
                <Text dimColor>  {dur}</Text>
                {hasActivity && <Text dimColor>  {s.edit_count} edits  {fileCount} files</Text>}
              </Text>
            );
          })}
        </Box>
      )}

      {navBar}
    </Box>
  );
}
