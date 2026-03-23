# Architecture

chinwag is the operations layer for your team's AI agents. It connects all your AI coding agents (Claude Code, Cursor, Codex, VS Code Copilot — anything MCP-compatible) so they share context, stay aware of each other, and never step on each other's work. One command sets it up. After that, it's invisible — your agents are just smarter.

The backend runs entirely on Cloudflare's edge. The primary interface is the MCP server that runs alongside each agent, not a CLI or GUI.

This document is the map. It explains what each piece does, where it lives, and why we made the choices we did. Read this before diving into the code.

## System Context

```
┌──────────────────────────────────────────────────────────────────┐
│                          chinwag                                 │
│                                                                  │
│  Developer's machine                                             │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐                │
│  │ Claude Code │  │   Cursor   │  │  Codex CLI │  ...           │
│  │   + hooks   │  │            │  │            │                │
│  │   + channel │  │            │  │            │                │
│  └──────┬─────┘  └──────┬─────┘  └──────┬─────┘                │
│         │               │               │                        │
│         └───────┬───────┴───────┬───────┘                        │
│                 ▼               ▼                                 │
│         ┌─────────────────────────┐                              │
│         │   chinwag MCP server    │  (one per agent connection)  │
│         │   - reports activity    │                              │
│         │   - checks conflicts   │                              │
│         │   - reads/writes memory │                              │
│         └───────────┬─────────────┘                              │
│                     │ HTTPS                                      │
│                     ▼                                             │
│         ┌──────────────────────┐                                 │
│         │  Cloudflare Workers  │                                 │
│         │  (API + coordination)│                                 │
│         └──────────┬───────────┘                                 │
│                    │                                              │
│          ┌─────────┴─────────┐                                   │
│          │  Durable Objects   │                                   │
│          │  TeamDO — coordination, memory, conflict detection    │
│          │  DatabaseDO — users, auth                             │
│          └─────────┬─────────┘                                   │
│          ┌─────────┴─────────┐                                   │
│          │  Cloudflare KV    │                                   │
│  ┌────┐  │  (token lookups)  │                                   │
│  │CLI │  └───────────────────┘                                   │
│  │dash│  (optional — for humans                                  │
│  │board│  who want the overview)                                 │
│  └────┘                                                          │
└──────────────────────────────────────────────────────────────────┘
```

**AI agents** are the primary users. They interact with chinwag through the MCP server that runs alongside each agent session. Developers interact with chinwag indirectly — their agents are smarter because chinwag is connected.

**The CLI dashboard** is optional. It gives developers a birds-eye view of all agents, costs, and activity. But the core value is delivered invisibly through the MCP connection.

**External dependencies** are limited to Cloudflare's platform: Workers (compute), Durable Objects (state), KV (auth lookups), and Pages (static hosting). There are no external databases, no Redis, no third-party APIs.

## How Agents Connect

### Setup (one-time per project)

```
npx chinwag init
```

This single command:
1. Creates an account (if first run) — generates token, saves to `~/.chinwag/config.json`
2. Creates a team for the project (or joins existing if `.chinwag` file exists)
3. Writes MCP config files for all detected tools:
   - `.mcp.json` — Claude Code auto-discovers this
   - `.cursor/mcp.json` — Cursor auto-discovers this
   - `.vscode/mcp.json` — VS Code auto-discovers this
4. For Claude Code: configures hooks (`.claude/settings.json`) and channel

The `.chinwag` file is committed to the repo. When a teammate clones and runs `npx chinwag init`, they auto-join the same team.

### Per-tool integration depth

| Tool | Integration | How |
|------|------------|-----|
| **Claude Code** | Full — push alerts + enforced conflict prevention | Channels push real-time team state. PreToolUse hooks block conflicting edits. SessionStart hook injects team context. |
| **Cursor** | Good — pull-based awareness | MCP `instructions` field + tool descriptions guide the agent to check chinwag. |
| **VS Code Copilot** | Good — pull-based awareness | MCP tools + instructions. Resources when supported. |
| **Codex CLI** | Basic — tool-based | MCP tools available. Agent must opt in to check. |

Claude Code gets the deepest integration because it supports hooks (enforceable system-level interception) and channels (server-initiated push). Other tools improve as their MCP implementations mature.

## Containers

The monorepo has four packages:

### `packages/mcp/` — MCP Server (the core product)

- **Technology:** Node.js, MCP SDK (stdio transport)
- **Entry point:** `index.js`
- **Responsibility:** The primary interface. Runs locally alongside each AI agent. Reports agent activity to the backend, checks for conflicts before file edits, reads/writes shared project memory. Exposes MCP tools and resources that agents use automatically.
- **Key constraint:** Never `console.log` — stdio transport uses stdout for JSON-RPC. Use `console.error` for all logging.

### `packages/worker/` — Backend API

- **Technology:** Cloudflare Workers, Durable Objects (SQLite), KV, Workers AI
- **Entry point:** `src/index.js` — HTTP router and auth middleware
- **Responsibility:** Authentication, team coordination, shared memory storage, conflict detection, agent activity tracking. All business logic lives here.
- **Key constraint:** Stateless at the Worker level. All persistent state lives in Durable Objects. The Worker is a router that authenticates requests and forwards them to the appropriate DO.

### `packages/cli/` — Dashboard + Community (optional)

- **Technology:** Node.js 22+, Ink (React for terminals), esbuild
- **Entry point:** `cli.jsx` — screen router
- **Responsibility:** Optional human interface. Agent operations dashboard (all agents, costs, conflicts, memory). Also houses community features (chat, daily notes) which are secondary to the agent operations focus.
- **Key constraint:** The CLI has no knowledge of Durable Objects, room IDs, or server internals. It speaks only the public HTTP/WebSocket API.

### `packages/web/` — Landing Page

- **Technology:** Static HTML/CSS/JS on Cloudflare Pages
- **Entry point:** `index.html`
- **Responsibility:** Marketing, install instructions. Fetches from the public `/stats` endpoint.
- **Key constraint:** No build step, no framework. Intentionally simple.

## Code Map

### Worker (`packages/worker/src/`)

| File | Responsibility |
|---|---|
| `index.js` | HTTP router. Matches request paths to handlers. Runs Bearer token auth on protected routes via KV lookup. Bridges HTTP/WebSocket to Durable Objects. |
| `db.js` | `DatabaseDO` — single instance holding all persistent data. Users, notes, exchanges, rate limits. SQLite storage. Implements the note exchange matching algorithm. |
| `team.js` | `TeamDO` — one instance per team. The core coordination DO. Manages team membership, agent activity tracking, file conflict detection, and shared project memory. |
| `lobby.js` | `LobbyDO` — single instance managing chat room assignment and global presence. Tracks active rooms and their sizes. Heartbeat-based presence with 60s TTL. |
| `room.js` | `RoomDO` — one instance per chat room. Holds WebSocket connections, broadcasts messages, maintains last 50 messages as history. |
| `moderation.js` | Two-layer content filter. Layer 1: synchronous regex blocklist (<1ms). Layer 2: async AI moderation via Llama Guard 3. Used for community features (chat, notes). |

### MCP Server (`packages/mcp/`)

| File | Responsibility |
|---|---|
| `index.js` | MCP server entry point. Registers tools for team coordination: `chinwag_join_team`, `chinwag_update_activity`, `chinwag_check_conflicts`, `chinwag_get_team_context`. Stdio transport. |

### CLI (`packages/cli/`)

| File | Responsibility |
|---|---|
| `cli.jsx` | App shell. Screen state machine: loading → welcome → home → {post, community, chat, customize}. Loads/validates config on startup. |
| `lib/home.jsx` | Home screen. Menu with single-key navigation. Displays greeting, status, online count. 30s heartbeat to presence endpoint. |
| `lib/post.jsx` | Note composition. Text input with 280-char counter. One post per day enforced server-side. |
| `lib/community.jsx` | Feed + inbox combined. Scrollable daily notes feed with cursor pagination. |
| `lib/chat.jsx` | Live chat. WebSocket connection with exponential backoff reconnect (1s→15s cap). |
| `lib/customize.jsx` | Profile editor. Change handle, cycle through 12-color palette, set status. |
| `lib/api.js` | HTTP client. Wraps fetch with Bearer token auth. All API calls go through this. |
| `lib/colors.js` | Maps chinwag's 12 colors to ANSI terminal colors for Ink rendering. |
| `lib/config.js` | Reads/writes `~/.chinwag/config.json`. Token, handle, color. |

## Data Flow

### Setup and Authentication

1. Developer runs `npx chinwag init` in a project directory
2. CLI calls `POST /auth/init` (no auth required)
3. Worker creates user in DatabaseDO: generates UUID, token, random two-word handle, random color
4. Worker writes `token:{uuid} → user_id` to KV
5. CLI saves `{token, handle, color}` to `~/.chinwag/config.json`
6. CLI creates team via `POST /teams`, writes `.chinwag` file with team ID
7. CLI writes MCP config files for detected tools (`.mcp.json`, `.cursor/mcp.json`, `.vscode/mcp.json`)
8. For Claude Code: writes hooks config to `.claude/settings.json`

### Agent Session Lifecycle

1. Developer opens Claude Code (or Cursor, Codex, etc.) in the project
2. Tool discovers MCP config, starts chinwag MCP server subprocess
3. MCP server reads `~/.chinwag/config.json` for auth token, `.chinwag` for team ID
4. MCP server joins team via backend API, reports agent type and session start
5. **Claude Code (hooks path):** SessionStart hook fires, calls chinwag backend, injects team context into Claude's session ("2 other agents active, Sarah's Cursor editing auth.js")
6. **Claude Code (channel path):** Channel pushes real-time updates as team state changes
7. **All tools (MCP path):** Agent can call `chinwag_check_conflicts` before edits, `chinwag_update_activity` to report what it's working on, `chinwag_get_team_context` for shared memory
8. **Claude Code (hooks enforcement):** PreToolUse hook on Edit/Write calls chinwag API — blocks the edit if another agent is in that file
9. On session end: MCP server reports disconnect, backend cleans up agent state

### Shared Project Memory

1. Agent discovers a project fact ("tests require Redis", "deploy needs AWS_REGION=us-west-2")
2. Agent calls `chinwag_save_memory` MCP tool with the fact
3. MCP server sends to backend, TeamDO persists in SQLite with metadata (source agent, timestamp, category)
4. Future agent sessions on the same team receive relevant memories via `chinwag_get_team_context`
5. Stale memories decay based on age and relevance signals

### Community Features (Secondary)

#### Chat (WebSocket)
1. CLI calls `GET /ws/chat` with Bearer token
2. Worker authenticates, asks LobbyDO for room assignment
3. LobbyDO picks room closest to 20 users (or creates new room if all ≥30)
4. Worker forwards WebSocket upgrade to the assigned RoomDO
5. RoomDO accepts connection, sends message history + room count

#### Daily Notes
1. User writes note in CLI, hits Enter
2. CLI calls `POST /notes` with `{message}`
3. Worker authenticates, runs content through moderation
4. If clean, DatabaseDO persists note and runs exchange matching

## Key Design Decisions

**MCP server is the product, not the CLI.** The primary value is delivered invisibly through agent MCP connections. The CLI dashboard is optional — most developers never need to open it. This is like git: you run `git init` once, then git works in the background. You don't "open git" to code.

**Claude Code gets the deepest integration.** Claude Code supports hooks (enforceable interception before file edits) and channels (server-initiated push). This enables conflict prevention that the agent cannot bypass. Other tools get softer integration via MCP instructions and tool descriptions. This is a deliberate tradeoff — Claude Code is the #1 most-loved AI coding tool and the most terminal-native.

**Durable Objects over external databases.** Each DO provides single-threaded coordination with embedded SQLite, eliminating the need for external database connections, connection pooling, or cache invalidation. State and compute are colocated at the edge. Trade-off: single-instance bottleneck for DatabaseDO, but adequate for our scale.

**TeamDO is the coordination hub.** One instance per team. Manages membership, agent activity, file conflict detection, and shared project memory. All agent coordination flows through TeamDO's single-writer guarantee, which eliminates race conditions in conflict detection.

**KV for auth only.** KV is eventually consistent, which is fine for token→user_id lookups (tokens are write-once). All other data lives in Durable Objects where we need strong consistency.

**`chinwag init` writes config for all detected tools.** Rather than requiring developers to manually configure MCP servers, the init command detects installed tools and writes their config files. This is the zero-friction adoption path — one command, then forget about it.

## Architectural Invariants

These are constraints that should be preserved as the codebase evolves:

- **MCP server is the primary interface.** The MCP server is how agents interact with chinwag. The CLI and web are secondary interfaces for humans. Features should be MCP-first.
- **CLI ↔ Worker boundary is the public API.** The CLI and MCP server must never depend on server internals (DO class names, room IDs, internal data formats). If a client needs something, it should be a documented API endpoint.
- **Durable Objects own their data.** No external system reads DO storage directly. All access goes through the DO's RPC methods. This preserves the single-writer guarantee.
- **Worker is stateless.** No request-scoped state in module-level variables. Workers reuse V8 isolates across requests — global state causes cross-request data leaks.
- **KV is append-only for auth.** Token mappings are written once at account creation and never updated.
- **MCP server: never `console.log`.** Stdio transport uses stdout for JSON-RPC. Any `console.log` corrupts the protocol. Use `console.error` for all logging.

## Crosscutting Concerns

### Authentication

Every protected endpoint follows the same flow in `index.js`:

1. Extract Bearer token from Authorization header
2. Look up `token:{value}` in KV → get `user_id`
3. Fetch full user object from DatabaseDO
4. Pass `user` to the route handler

No middleware framework — it's a simple `if/else` chain with early returns.

### Content Moderation

Applies to community features (notes, chat messages, status text). Two layers:

1. **Blocklist** (`moderation.js:isBlocked`) — synchronous regex scan. Returns immediately. Used inline for chat where latency matters.
2. **AI** (`moderation.js:moderateWithAI`) — async call to Llama Guard 3 via `env.AI`. Returns category codes (S1-S14). Used before persisting notes/status.

`checkContent()` runs both layers sequentially and returns `{blocked, reason, categories}`.

### Error Handling

Workers return structured JSON errors: `{error: "message"}` with appropriate HTTP status codes. The CLI and MCP server display error messages. No stack traces leak to clients.

## Technology Choices

| Technology | Used For | Why This Over Alternatives |
|---|---|---|
| Cloudflare Workers | HTTP API, coordination backend | Edge compute, no cold starts, native WebSocket support, free tier |
| Durable Objects (SQLite) | Persistent state, team coordination | Colocated state+compute, transactional, no external DB needed |
| Cloudflare KV | Auth token lookups | Global low-latency reads, perfect for read-heavy/write-once data |
| MCP (Model Context Protocol) | Agent integration | Industry standard (97M+ monthly SDK downloads), supported by Claude Code, Cursor, VS Code, Codex |
| Claude Code Hooks | Enforceable conflict prevention | System-level interception before file edits, cannot be bypassed by agent |
| Claude Code Channels | Real-time push to agents | Server-initiated context injection into running sessions |
| Ink (React for terminals) | CLI dashboard rendering | Component model for terminal UIs, hooks, familiar React patterns |
| esbuild | CLI bundling | Fast, zero-config ESM bundling |
| Cloudflare Pages | Landing page hosting | Static hosting with global CDN, same platform as backend |

## Future Direction

chinwag is the operations layer for your team's AI agents. The product has three phases:

**Phase 1 — Shared context + coordination (current focus):** Agents share project knowledge and stay aware of each other. `chinwag init` sets everything up. Claude Code gets enforced conflict prevention via hooks/channels. Other tools get MCP-based awareness. Basic dashboard shows agent fleet.

**Phase 2 — Full observability:** Cost tracking across all agents and tools. Model usage monitoring. Activity history. Persistent external references (images, designs, links, docs) that survive context window compression.

**Phase 3 — Optimization intelligence:** Detect overlap between agents. Suggest new agents for uncovered areas. Consolidate redundant work. Agent lifecycle management — auto-provision agents with the right context pre-loaded.

**Community features** (chat, daily notes) remain available but are secondary to the agent operations focus. They may grow organically as the user base develops.

**What this means for contributors:**

- The MCP server is the primary interface — build features that make agents smarter and more coordinated
- The CLI dashboard is the human window into agent operations — keep it informative and optional
- All DO communication uses RPC, not fetch. New features should follow this pattern.
- Maintain the MCP server ↔ Worker API boundary (agents use the same API as the CLI)

---

*This document follows the [ARCHITECTURE.md convention](https://matklad.github.io/2021/02/06/ARCHITECTURE.md.html). It should be updated a few times per year, not per commit. If a section becomes stale, fix it or flag it in an issue.*
