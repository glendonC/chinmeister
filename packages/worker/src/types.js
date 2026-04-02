// Shared JSDoc type definitions for the worker package.
// These types document the contracts between route handlers and Durable Objects.
//
// Import with: /** @import { DOResult, User, ... } from './types.js' */

// ── DO Result pattern ──
// Every DO method returns { ok: true, ...data } on success or { error: string } on failure.
// Route handlers check `.error` and map to the appropriate HTTP status.

/**
 * Successful DO response. May contain `ok: true` plus arbitrary data fields,
 * or may contain just data fields (e.g. `{ memories: [...] }`).
 * @typedef {Record<string, any>} DOSuccess
 */

/**
 * @typedef {{ error: string }} DOError
 */

/**
 * Standard DO method return type. Check `.error` to distinguish success from failure.
 * @typedef {DOSuccess | DOError} DOResult
 */

// ── User ──

/**
 * @typedef {object} User
 * @property {string} id
 * @property {string} handle
 * @property {string} color
 * @property {string | null} status
 * @property {string | null} [github_id]
 * @property {string | null} [github_login]
 * @property {string | null} [avatar_url]
 * @property {string} created_at
 * @property {string} last_active
 */

/**
 * @typedef {object} NewUser
 * @property {string} id
 * @property {string} handle
 * @property {string} color
 * @property {string} token
 */

// ── Agent Runtime ──

/**
 * Normalized runtime metadata extracted from request headers.
 * @typedef {object} AgentRuntime
 * @property {string} agentId
 * @property {string} tool
 * @property {string} host_tool
 * @property {string} hostTool
 * @property {string | null} agent_surface
 * @property {string | null} agentSurface
 * @property {string | null} transport
 * @property {string | null} tier
 */

/**
 * Normalized runtime metadata for DO submodules (no agentId).
 * @typedef {object} RuntimeMetadata
 * @property {string} tool
 * @property {string} hostTool
 * @property {string | null} agentSurface
 * @property {string | null} transport
 * @property {string | null} tier
 * @property {string | null} model
 */

// ── Team membership ──

/**
 * @typedef {object} TeamMember
 * @property {string} agent_id
 * @property {string} handle
 * @property {string} tool
 * @property {string} host_tool
 * @property {string | null} agent_surface
 * @property {string | null} transport
 * @property {string | null} agent_model
 * @property {'active' | 'offline'} status
 * @property {string | null} framework
 * @property {number | null} session_minutes
 * @property {number | null} seconds_since_update
 * @property {number | null} minutes_since_update
 * @property {'websocket' | 'http' | 'none'} signal_tier
 * @property {TeamActivity | null} activity
 */

/**
 * @typedef {object} TeamActivity
 * @property {string[]} files
 * @property {string} summary
 * @property {string} updated_at
 */

// ── Conflicts ──

/**
 * @typedef {object} FileConflict
 * @property {string} owner_handle
 * @property {string} tool
 * @property {string[]} files
 * @property {string} summary
 */

/**
 * @typedef {object} LockedFile
 * @property {string} file
 * @property {string} held_by
 * @property {string} tool
 * @property {string} claimed_at
 */

/**
 * @typedef {object} ConflictResult
 * @property {FileConflict[]} conflicts
 * @property {LockedFile[]} locked
 */

// ── Memory ──

/**
 * @typedef {object} Memory
 * @property {string} id
 * @property {string} text
 * @property {string[]} tags
 * @property {string} source_handle
 * @property {string} source_tool
 * @property {string} source_host_tool
 * @property {string | null} source_agent_surface
 * @property {string | null} source_model
 * @property {string} created_at
 * @property {string} updated_at
 */

// ── Locks ──

/**
 * @typedef {object} LockClaim
 * @property {boolean} ok
 * @property {string[]} claimed
 * @property {BlockedLock[]} blocked
 */

/**
 * @typedef {object} BlockedLock
 * @property {string} file
 * @property {string} held_by
 * @property {string} tool
 * @property {string} host_tool
 * @property {string | null} agent_surface
 * @property {string} claimed_at
 */

/**
 * @typedef {object} LockEntry
 * @property {string} file_path
 * @property {string} agent_id
 * @property {string} owner_handle
 * @property {string} tool
 * @property {string} host_tool
 * @property {string | null} agent_surface
 * @property {string} claimed_at
 * @property {number} minutes_held
 */

// ── Sessions ──

/**
 * @typedef {object} SessionInfo
 * @property {string} owner_handle
 * @property {string} framework
 * @property {string} host_tool
 * @property {string | null} agent_surface
 * @property {string | null} transport
 * @property {string | null} agent_model
 * @property {string} started_at
 * @property {string | null} ended_at
 * @property {number} edit_count
 * @property {string[]} files_touched
 * @property {number} conflicts_hit
 * @property {number} memories_saved
 * @property {number} duration_minutes
 */

// ── Messages ──

/**
 * @typedef {object} AgentMessage
 * @property {string} id
 * @property {string} from_handle
 * @property {string} from_tool
 * @property {string} from_host_tool
 * @property {string | null} from_agent_surface
 * @property {string | null} target_agent
 * @property {string} text
 * @property {string} created_at
 */

// ── Team context ──

/**
 * @typedef {object} TeamContext
 * @property {TeamMember[]} members
 * @property {Array<{file: string, agents: string[]}>} conflicts
 * @property {LockEntry[]} locks
 * @property {Memory[]} memories
 * @property {AgentMessage[]} messages
 * @property {SessionInfo[]} recentSessions
 * @property {Array<{tool: string, joins: number}>} tools_configured
 * @property {Array<{host_tool: string, joins: number}>} hosts_configured
 * @property {Array<{agent_surface: string, joins: number}>} surfaces_seen
 * @property {Array<{model: string, count: number}>} models_seen
 * @property {Record<string, number>} usage
 */

/**
 * @typedef {object} TeamSummary
 * @property {number} active_agents
 * @property {number} total_members
 * @property {number} conflict_count
 * @property {number} memory_count
 * @property {number} live_sessions
 * @property {number} recent_sessions_24h
 */

// ── Rate limiting ──

/**
 * @typedef {object} RateLimitCheck
 * @property {boolean} allowed
 * @property {number} count
 */

// ── Web session ──

/**
 * @typedef {object} WebSession
 * @property {string} token
 * @property {string} user_id
 * @property {string} expires_at
 * @property {string} last_used
 * @property {string | null} user_agent
 * @property {number} revoked
 */

// ── User teams ──

/**
 * @typedef {object} UserTeam
 * @property {string} team_id
 * @property {string | null} team_name
 * @property {string} joined_at
 */

// ── Agent profile ──

/**
 * @typedef {object} AgentProfile
 * @property {string | null} framework
 * @property {string[]} languages
 * @property {string[]} frameworks
 * @property {string[]} tools
 * @property {string[]} platforms
 */

// ── Moderation ──

/**
 * @typedef {object} ModerationResult
 * @property {boolean} blocked
 * @property {string} [reason]
 * @property {string[]} [categories]
 */

// ── Worker environment bindings (from wrangler.toml) ──

/**
 * @typedef {object} Env
 * @property {DurableObjectNamespace} DATABASE
 * @property {DurableObjectNamespace} LOBBY
 * @property {DurableObjectNamespace} ROOM
 * @property {DurableObjectNamespace} TEAM
 * @property {KVNamespace} AUTH_KV
 * @property {any} AI
 * @property {string} ENVIRONMENT
 * @property {string} DASHBOARD_URL
 * @property {string} [GITHUB_CLIENT_ID]
 * @property {string} [GITHUB_CLIENT_SECRET]
 * @property {string} [EXA_API_KEY]
 */

// ── Parsed request body (from parseBody) ──

/**
 * @typedef {{ _parseError: string } | Record<string, any>} ParsedBody
 */

// ── Team path parse result ──

/**
 * @typedef {object} TeamPathResult
 * @property {string} teamId
 * @property {string} action
 */

export {};
