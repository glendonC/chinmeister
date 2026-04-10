/**
 * Post-session conversation collector.
 *
 * After a managed CLI agent session exits, reads conversation logs and
 * uploads parsed events to the chinwag backend for conversation analytics.
 *
 * Supported tools:
 * - Claude Code: reads JSONL conversation files from ~/.claude/projects/
 * - Aider: reads .aider.chat.history.md from the working directory
 *
 * Runs asynchronously after session end — never blocks process cleanup.
 */
import { readFile, readdir, stat } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { createLogger } from '@chinwag/shared';
import { getDataCapabilities } from '@chinwag/shared/tool-registry.js';
import type { ChinwagConfig } from '@chinwag/shared/config.js';
import { api } from '../api.js';
import type { ManagedProcess } from './types.js';

const log = createLogger('conversation-collector');

// -- Types --

interface ConversationEvent {
  role: 'user' | 'assistant';
  content: string;
  sequence: number;
  created_at?: string;
}

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
}

type ConversationParser = (cwd: string, startedAt: number) => Promise<ConversationEvent[]>;
type TokenParser = (cwd: string, startedAt: number) => Promise<TokenUsage | null>;

// -- Parser Registries --
// Adding a new tool = one parser function + one entry here + dataCapabilities flag in tool-registry.

const CONVERSATION_PARSERS: Record<string, ConversationParser> = {
  'claude-code': parseClaudeCodeConversation,
  aider: parseAiderConversation,
};

const TOKEN_PARSERS: Record<string, TokenParser> = {
  'claude-code': extractClaudeCodeTokenUsage,
};

// -- Public API --

/**
 * Collect and upload conversation events from a completed managed session.
 * Uses the parser registry — never branches on tool ID directly.
 */
export async function collectConversation(
  proc: ManagedProcess,
  config: ChinwagConfig | null,
  teamId: string | null,
  sessionId: string | null,
): Promise<void> {
  if (!config?.token || !teamId || !sessionId) return;

  const capabilities = getDataCapabilities(proc.toolId);
  if (!capabilities.conversationLogs) {
    log.info(
      `conversation analytics not available for ${proc.toolId} — no conversationLogs capability. ` +
        `Session/edit analytics are still tracked.`,
    );
    return;
  }

  const parser = CONVERSATION_PARSERS[proc.toolId];
  if (!parser) {
    log.warn(
      `${proc.toolId} declares conversationLogs capability but no parser is registered — ` +
        `add a parser to CONVERSATION_PARSERS in conversation-collector.ts`,
    );
    return;
  }

  try {
    const events = await parser(proc.cwd, proc.startedAt);

    if (events.length === 0) {
      log.info(
        `no conversation events found for ${proc.toolId} session — logs may be empty or in an unexpected location`,
      );
      return;
    }

    const client = api(config, { agentId: proc.agentId });
    await client.post(`/teams/${teamId}/conversations`, {
      session_id: sessionId,
      host_tool: proc.toolId,
      events,
    });

    log.info(`uploaded ${events.length} conversation events for session ${sessionId}`);
  } catch (err) {
    log.warn(`conversation collection failed: ${err}`);
  }
}

/**
 * Collect and upload token usage from a completed managed session.
 * Uses the parser registry — never branches on tool ID directly.
 */
export async function collectTokenUsage(
  proc: ManagedProcess,
  config: ChinwagConfig | null,
  teamId: string | null,
  sessionId: string | null,
): Promise<void> {
  if (!config?.token || !teamId || !sessionId) return;

  const capabilities = getDataCapabilities(proc.toolId);
  if (!capabilities.tokenUsage) return;

  const parser = TOKEN_PARSERS[proc.toolId];
  if (!parser) {
    log.warn(`${proc.toolId} declares tokenUsage capability but no parser is registered`);
    return;
  }

  try {
    const usage = await parser(proc.cwd, proc.startedAt);
    if (!usage || (usage.input_tokens === 0 && usage.output_tokens === 0)) return;

    const client = api(config, { agentId: proc.agentId });
    await client.post(`/teams/${teamId}/sessiontokens`, {
      session_id: sessionId,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
    });

    log.info(
      `uploaded token usage for session ${sessionId}: ${usage.input_tokens} in, ${usage.output_tokens} out`,
    );
  } catch (err) {
    log.warn(`token usage collection failed: ${err}`);
  }
}

// -- Claude Code parser --

/**
 * Parse Claude Code JSONL conversation files.
 * Claude Code stores conversations in ~/.claude/projects/<project-hash>/
 * where project-hash is the CWD path with / replaced by -.
 * We scope to the matching project directory to avoid picking up
 * conversation files from unrelated projects.
 */
async function parseClaudeCodeConversation(
  cwd: string,
  startedAt: number,
): Promise<ConversationEvent[]> {
  const projectsDir = join(homedir(), '.claude', 'projects');

  try {
    await stat(projectsDir);
  } catch {
    return [];
  }

  // Claude Code hashes project paths as: /Users/foo/bar → -Users-foo-bar
  const projectHash = cwd.replace(/\//g, '-');

  try {
    // First try the exact project directory
    const candidates: string[] = [];
    const projectDirs = await readdir(projectsDir);

    for (const dir of projectDirs) {
      // Match the project hash — Claude Code uses the full path with - separators
      if (dir === projectHash || dir.endsWith(projectHash)) {
        candidates.push(dir);
      }
    }

    // If no exact match, fall back to all directories (but warn)
    const dirsToSearch = candidates.length > 0 ? candidates : projectDirs;
    if (candidates.length === 0) {
      log.warn(`no exact project match for ${projectHash}, searching all projects`);
    }

    let newestFile: string | null = null;
    let newestMtime = 0;

    for (const dir of dirsToSearch) {
      const dirPath = join(projectsDir, dir);
      const dirStat = await stat(dirPath).catch(() => null);
      if (!dirStat?.isDirectory()) continue;

      // Search subdirectories (session UUIDs) within the project dir
      const entries = await readdir(dirPath).catch(() => []);
      for (const entry of entries) {
        const entryPath = join(dirPath, entry);
        const entryStat = await stat(entryPath).catch(() => null);

        if (entryStat?.isDirectory()) {
          // Session subdirectory — look for JSONL files inside
          const subFiles = await readdir(entryPath).catch(() => []);
          for (const file of subFiles) {
            if (!file.endsWith('.jsonl')) continue;
            const filePath = join(entryPath, file);
            const fileStat = await stat(filePath).catch(() => null);
            if (!fileStat) continue;
            if (fileStat.mtimeMs > startedAt && fileStat.mtimeMs > newestMtime) {
              newestMtime = fileStat.mtimeMs;
              newestFile = filePath;
            }
          }
        } else if (entry.endsWith('.jsonl') && entryStat) {
          // JSONL directly in project dir
          if (entryStat.mtimeMs > startedAt && entryStat.mtimeMs > newestMtime) {
            newestMtime = entryStat.mtimeMs;
            newestFile = entryPath;
          }
        }
      }
    }

    if (!newestFile) return [];

    const content = await readFile(newestFile, 'utf-8');
    return parseClaudeCodeJsonl(content);
  } catch (err) {
    log.warn(`failed to read Claude Code conversations: ${err}`);
    return [];
  }
}

function parseClaudeCodeJsonl(content: string): ConversationEvent[] {
  const events: ConversationEvent[] = [];
  const lines = content.split('\n').filter(Boolean);
  let sequence = 0;

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);

      // Claude Code JSONL format has type: 'human' or 'assistant' messages
      if (entry.type === 'human' || entry.role === 'user') {
        const text = extractMessageText(entry);
        if (text) {
          events.push({
            role: 'user',
            content: text,
            sequence: sequence++,
            created_at: entry.timestamp || undefined,
          });
        }
      } else if (entry.type === 'assistant' || entry.role === 'assistant') {
        const text = extractMessageText(entry);
        if (text) {
          events.push({
            role: 'assistant',
            content: text,
            sequence: sequence++,
            created_at: entry.timestamp || undefined,
          });
        }
      }
    } catch {
      // Skip malformed lines
    }
  }

  return events;
}

function extractMessageText(entry: Record<string, unknown>): string | null {
  // Handle various message content formats
  if (typeof entry.message === 'string') return entry.message;
  if (typeof entry.text === 'string') return entry.text;
  if (typeof entry.content === 'string') return entry.content;

  // Handle content array format (Anthropic API style)
  if (Array.isArray(entry.content)) {
    const textParts = (entry.content as Array<Record<string, unknown>>)
      .filter((block) => block.type === 'text')
      .map((block) => block.text as string)
      .filter(Boolean);
    return textParts.length > 0 ? textParts.join('\n') : null;
  }

  // Handle nested message object
  if (entry.message && typeof entry.message === 'object') {
    const msg = entry.message as Record<string, unknown>;
    if (typeof msg.content === 'string') return msg.content;
    if (Array.isArray(msg.content)) {
      const textParts = (msg.content as Array<Record<string, unknown>>)
        .filter((block) => block.type === 'text')
        .map((block) => block.text as string)
        .filter(Boolean);
      return textParts.length > 0 ? textParts.join('\n') : null;
    }
  }

  return null;
}

// -- Aider parser --

/**
 * Parse Aider's conversation history file.
 * Aider writes `.aider.chat.history.md` in the project directory.
 */
async function parseAiderConversation(
  cwd: string,
  startedAt: number,
): Promise<ConversationEvent[]> {
  const historyPath = join(cwd, '.aider.chat.history.md');

  try {
    const fileStat = await stat(historyPath);
    // Only read if modified after session started
    if (fileStat.mtimeMs < startedAt) return [];

    const content = await readFile(historyPath, 'utf-8');
    return parseAiderMarkdown(content);
  } catch {
    return [];
  }
}

function parseAiderMarkdown(content: string): ConversationEvent[] {
  const events: ConversationEvent[] = [];
  const lines = content.split('\n');
  let sequence = 0;
  let currentRole: 'user' | 'assistant' | null = null;
  let currentContent: string[] = [];

  for (const line of lines) {
    // Aider uses #### markers for user messages and #### for assistant
    if (line.startsWith('#### ')) {
      // Flush previous message
      if (currentRole && currentContent.length > 0) {
        events.push({
          role: currentRole,
          content: currentContent.join('\n').trim(),
          sequence: sequence++,
        });
        currentContent = [];
      }
      currentRole = 'user';
      const text = line.slice(5).trim();
      if (text) currentContent.push(text);
    } else if (line.startsWith('> ')) {
      // Assistant responses in blockquotes
      if (currentRole === 'user' && currentContent.length > 0) {
        events.push({
          role: currentRole,
          content: currentContent.join('\n').trim(),
          sequence: sequence++,
        });
        currentContent = [];
      }
      currentRole = 'assistant';
      currentContent.push(line.slice(2));
    } else if (currentRole) {
      currentContent.push(line);
    }
  }

  // Flush last message
  if (currentRole && currentContent.length > 0) {
    events.push({
      role: currentRole,
      content: currentContent.join('\n').trim(),
      sequence: sequence++,
    });
  }

  return events;
}

// -- Token extraction --

/**
 * Extract token usage from Claude Code JSONL conversation files.
 * Claude Code includes `usage` objects on assistant messages with
 * input_tokens and output_tokens fields.
 * Uses the same project directory discovery as parseClaudeCodeConversation.
 */
async function extractClaudeCodeTokenUsage(
  cwd: string,
  startedAt: number,
): Promise<TokenUsage | null> {
  const projectsDir = join(homedir(), '.claude', 'projects');

  try {
    await stat(projectsDir);
  } catch {
    return null;
  }

  const projectHash = cwd.replace(/\//g, '-');

  try {
    const projectDirs = await readdir(projectsDir);
    const candidates: string[] = [];

    for (const dir of projectDirs) {
      if (dir === projectHash || dir.endsWith(projectHash)) {
        candidates.push(dir);
      }
    }

    const dirsToSearch = candidates.length > 0 ? candidates : projectDirs;
    let newestFile: string | null = null;
    let newestMtime = 0;

    for (const dir of dirsToSearch) {
      const dirPath = join(projectsDir, dir);
      const dirStat = await stat(dirPath).catch(() => null);
      if (!dirStat?.isDirectory()) continue;

      const entries = await readdir(dirPath).catch(() => []);
      for (const entry of entries) {
        const entryPath = join(dirPath, entry);
        const entryStat = await stat(entryPath).catch(() => null);

        if (entryStat?.isDirectory()) {
          const subFiles = await readdir(entryPath).catch(() => []);
          for (const file of subFiles) {
            if (!file.endsWith('.jsonl')) continue;
            const filePath = join(entryPath, file);
            const fileStat = await stat(filePath).catch(() => null);
            if (fileStat && fileStat.mtimeMs > startedAt && fileStat.mtimeMs > newestMtime) {
              newestMtime = fileStat.mtimeMs;
              newestFile = filePath;
            }
          }
        } else if (entry.endsWith('.jsonl') && entryStat) {
          if (entryStat.mtimeMs > startedAt && entryStat.mtimeMs > newestMtime) {
            newestMtime = entryStat.mtimeMs;
            newestFile = entryPath;
          }
        }
      }
    }

    if (!newestFile) return null;

    const content = await readFile(newestFile, 'utf-8');
    let totalInput = 0;
    let totalOutput = 0;

    for (const line of content.split('\n').filter(Boolean)) {
      try {
        const entry = JSON.parse(line);
        const usage =
          entry.usage ||
          (entry.message && typeof entry.message === 'object' ? entry.message.usage : null);
        if (usage && typeof usage === 'object') {
          totalInput += (usage.input_tokens as number) || 0;
          totalOutput += (usage.output_tokens as number) || 0;
        }
      } catch {
        // Skip malformed lines
      }
    }

    if (totalInput === 0 && totalOutput === 0) return null;
    return { input_tokens: totalInput, output_tokens: totalOutput };
  } catch (err) {
    log.warn(`failed to extract Claude Code token usage: ${err}`);
    return null;
  }
}
