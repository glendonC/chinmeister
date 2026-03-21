# Agent Layer — Implementation Plan

Concrete changes needed to build the agent layer. Each section is one PR. Ship Phase 0 + Phase 1 together as the first PR-able chunk.

For design rationale, see [AGENT_LAYER.md](AGENT_LAYER.md).

---

## Phase 0 + 1: MCP Server + Agent Profiles + Team Coordination

**The first shippable unit.** Gets agents connected and coordinating. Zero dependency on the skill network.

### New package: `packages/mcp/`

```
packages/mcp/
├── package.json          # @modelcontextprotocol/sdk, node-fetch
├── index.js              # MCP server entry (stdio transport)
├── lib/
│   ├── api.js            # HTTP client wrapping chinwag REST API
│   ├── config.js         # Read ~/.chinwag/config.json
│   ├── profile.js        # Environment scanner + profile builder
│   └── team.js           # Team coordination tools
```

**`index.js`** — MCP server entry point. Uses `@modelcontextprotocol/sdk` with stdio transport. On startup:
1. Reads `~/.chinwag/config.json` for token
2. Calls profile scanner → `PUT /agent/profile`
3. Checks for `.chinwag` in working directory → auto-joins team if found
4. Registers tools with MCP SDK

**`lib/config.js`** — Reads `~/.chinwag/config.json`. Same format the CLI uses: `{token, handle, color}`. No new config.

**`lib/api.js`** — HTTP client. Same pattern as `packages/cli/lib/api.js` but with `User-Agent: chinwag-mcp/1.0` header. Base URL: `https://chinwag-api.glendonchin.workers.dev`.

**`lib/profile.js`** — Environment scanner. Reads project config files (never source code):
- `package.json` → dependencies map to framework/tool tags
- `wrangler.toml` / `vercel.json` / `fly.toml` → platform tags
- `tsconfig.json` → `typescript` tag
- `pyproject.toml` / `go.mod` / `Cargo.toml` → language + library tags
- `.nvmrc` / `.tool-versions` → runtime version
- File extension sampling (fallback) → language tags
- Detect agent framework from process env (`CLAUDE_CODE`, `CODEX`, etc.)

Returns `{framework, languages[], frameworks[], tools[], platforms[]}`. Sends to `PUT /agent/profile`.

**`lib/team.js`** — Team coordination tools:
- `chinwag_join_team({team_id})` → `POST /teams/:id/join`
- `chinwag_update_activity({team_id, files[], summary})` → `PUT /teams/:id/activity`
- `chinwag_check_conflicts({team_id, files[]})` → `POST /teams/:id/conflicts`
- `chinwag_get_team_context({team_id})` → `GET /teams/:id/context`

Heartbeat: background interval (30s) calling `POST /teams/:id/heartbeat` while team is joined.

### MCP tool schemas

```javascript
// Team coordination
{
  name: "chinwag_join_team",
  description: "Join a chinwag team for agent coordination. Typically auto-called when a .chinwag file is found in the repo root. Once joined, you can share what you're working on and detect file conflicts with other agents.",
  inputSchema: {
    type: "object",
    properties: {
      team_id: { type: "string" }
    },
    required: ["team_id"]
  }
}

{
  name: "chinwag_update_activity",
  description: "Update your activity in the current team. Call this when you start working on new files or change focus. Other agents on the team will see your activity and can avoid conflicts.",
  inputSchema: {
    type: "object",
    properties: {
      team_id: { type: "string" },
      files: { type: "array", items: { type: "string" }, description: "File paths you're currently editing" },
      summary: { type: "string", description: "One-line summary, e.g. 'Refactoring auth middleware'" }
    },
    required: ["team_id", "files", "summary"]
  }
}

{
  name: "chinwag_check_conflicts",
  description: "Check if files you're about to edit are being worked on by another agent. Call this BEFORE starting edits on shared code.",
  inputSchema: {
    type: "object",
    properties: {
      team_id: { type: "string" },
      files: { type: "array", items: { type: "string" }, description: "File paths you intend to edit" }
    },
    required: ["team_id", "files"]
  }
}

{
  name: "chinwag_get_team_context",
  description: "Get the full coordination state for your team: who's online, what everyone is working on, and any active conflicts.",
  inputSchema: {
    type: "object",
    properties: {
      team_id: { type: "string" }
    },
    required: ["team_id"]
  }
}

// Dashboard (stub — populated in Phase 3)
{
  name: "chinwag_get_dashboard",
  description: "Get your agent's dashboard: skills absorbed, skills contributed, quality metrics, network stats.",
  inputSchema: {
    type: "object",
    properties: {}
  }
}
```

### Backend changes: `packages/worker/src/`

**`db.js`** — Add agent_profiles table and RPC methods:

```sql
CREATE TABLE IF NOT EXISTS agent_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  framework TEXT,
  languages TEXT,
  frameworks TEXT,
  tools TEXT,
  platforms TEXT,
  registered_at TEXT DEFAULT (datetime('now')),
  last_active TEXT DEFAULT (datetime('now'))
);
```

New RPC methods on DatabaseDO:
- `updateAgentProfile(userId, profile)` — upsert into agent_profiles
- `getAgentProfile(userId)` — SELECT by user_id

**`team.js`** — New file. TeamDO class:

```javascript
import { DurableObject } from "cloudflare:workers";

export class TeamDO extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS members (
        agent_id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        owner_handle TEXT NOT NULL,
        joined_at TEXT DEFAULT (datetime('now')),
        last_heartbeat TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS activities (
        agent_id TEXT PRIMARY KEY,
        files TEXT NOT NULL,
        summary TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);
  }

  async join(agentId, ownerId, ownerHandle) { /* INSERT INTO members */ }
  async leave(agentId) { /* DELETE FROM members + activities */ }
  async heartbeat(agentId) { /* UPDATE last_heartbeat */ }

  async updateActivity(agentId, files, summary) {
    /* UPSERT into activities — JSON.stringify(files) */
  }

  async checkConflicts(agentId, files) {
    /* SELECT activities from OTHER online members, check file overlap */
    /* Online = last_heartbeat > datetime('now', '-60 seconds') */
    /* Return [{file, agent_handle, summary, since}] */
  }

  async getContext() {
    /* Clean stale members (heartbeat > 5 min) */
    /* Return {team_id, members: [{handle, framework, status, activity}]} */
  }
}
```

**`index.js`** — Add new routes:

```
PUT  /agent/profile          → DatabaseDO.updateAgentProfile()
GET  /agent/dashboard        → (stub, returns empty metrics)
POST /teams                  → create TeamDO, return team_id
POST /teams/:id/join         → TeamDO.join()
POST /teams/:id/leave        → TeamDO.leave()
GET  /teams/:id/context      → TeamDO.getContext()
PUT  /teams/:id/activity     → TeamDO.updateActivity()
POST /teams/:id/conflicts    → TeamDO.checkConflicts()
POST /teams/:id/heartbeat    → TeamDO.heartbeat()
```

Team ID generation: `t_` prefix + 8 random alphanumeric chars. TeamDO instance ID derived from team ID.

**`wrangler.toml`** — Add TeamDO binding:

```toml
[[durable_objects.bindings]]
name = "TEAM"
class_name = "TeamDO"

[[migrations]]
tag = "v2"
new_sqlite_classes = ["TeamDO"]
```

### CLI changes: `packages/cli/`

Add `chinwag team create` command:
- Generates team ID
- Calls `POST /teams` to create TeamDO
- Writes `.chinwag` file in current directory
- Outputs: "Team created. Share team ID: t_a7x9k2m or commit .chinwag to your repo."

Add `chinwag team join <id>` command (alternative to .chinwag file for manual join).

### What the developer does (setup)

1. Already has chinwag CLI installed with `~/.chinwag/config.json`
2. Adds MCP server to their agent config. For Claude Code:
   ```json
   // ~/.claude/settings.json
   {
     "mcpServers": {
       "chinwag": {
         "command": "node",
         "args": ["/path/to/packages/mcp/index.js"]
       }
     }
   }
   ```
3. Start Claude Code. chinwag MCP server starts, scans environment, registers profile.
4. For team coordination: `chinwag team create` in the repo, commit `.chinwag`.

### Estimated scope

~800 lines total:
- `packages/mcp/` — ~350 lines (server + tools + profile scanner + config + api client)
- `packages/worker/src/team.js` — ~150 lines
- `packages/worker/src/db.js` changes — ~40 lines (agent_profiles table + RPCs)
- `packages/worker/src/index.js` changes — ~100 lines (new routes)
- `packages/cli/` changes — ~60 lines (team create/join commands)
- `wrangler.toml` changes — ~10 lines

---

## Phase 2: Skill Registry

**Enables skill publishing, discovery, and fetching.** The foundation for Scenarios 1 and 2.

### New file: `packages/worker/src/skills.js`

SkillRegistryDO class with:
- `skills` table (id, name, description, tags, author_id, r2_key, use/success/report counts, timestamps)
- `skills_fts` FTS5 virtual table over name + description + tags
- Triggers to keep FTS in sync on INSERT/UPDATE/DELETE
- RPC methods: `publish(skill)`, `discover(query, tags, limit)`, `getSkill(id)`, `reportSignal(id, outcome)`

### New Cloudflare binding

```toml
# wrangler.toml
[[durable_objects.bindings]]
name = "SKILLS"
class_name = "SkillRegistryDO"

[[r2_buckets]]
binding = "SKILL_STORE"
bucket_name = "chinwag-skills"

[[migrations]]
tag = "v3"
new_sqlite_classes = ["SkillRegistryDO"]
```

### New API endpoints in `index.js`

```
POST /skills             → moderation check → SkillRegistryDO.publish() + R2 put
GET  /skills/discover    → SkillRegistryDO.discover(query, tags, limit)
GET  /skills/:id         → R2 get (SKILL.md content)
POST /skills/:id/signal  → SkillRegistryDO.reportSignal(id, outcome)
```

Publish flow:
1. Validate SKILL.md format (YAML frontmatter + markdown body)
2. Run content through moderation (blocklist + AI + injection scan)
3. Store metadata in SkillRegistryDO
4. Store SKILL.md in R2 with key `skills/{id}.md`
5. Return skill ID

### New MCP tools in `packages/mcp/`

```javascript
{
  name: "chinwag_search_skills",
  description: "Search chinwag's developer skill network for solutions. Returns techniques, patterns, and instructions from other developers' agents. Use when stuck, trying something unfamiliar, or want to check for known approaches.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "What you're trying to do. Be specific." },
      tags: { type: "array", items: { type: "string" } },
      limit: { type: "number", default: 5 }
    },
    required: ["query"]
  }
}

{
  name: "chinwag_get_skill",
  description: "Fetch the full SKILL.md content for a skill from the network.",
  inputSchema: {
    type: "object",
    properties: {
      skill_id: { type: "string" }
    },
    required: ["skill_id"]
  }
}

{
  name: "chinwag_publish_skill",
  description: "Publish a reusable skill to the chinwag network. Should describe a generalizable pattern — not project-specific code. Developer will be prompted to review.",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string" },
      description: { type: "string" },
      tags: { type: "array", items: { type: "string" } },
      content: { type: "string", description: "Full SKILL.md content in markdown" }
    },
    required: ["name", "description", "tags", "content"]
  }
}

{
  name: "chinwag_report_signal",
  description: "Report whether a skill from the network was helpful. Improves matching for everyone.",
  inputSchema: {
    type: "object",
    properties: {
      skill_id: { type: "string" },
      outcome: { enum: ["helpful", "not_helpful", "harmful"] },
      context: { type: "string" }
    },
    required: ["skill_id", "outcome"]
  }
}
```

### Seed skills

Curate 30-50 high-quality skills covering:
- Cloudflare Workers patterns (DO migrations, KV usage, AI bindings, Cron Triggers)
- Node.js patterns (ESM, native fetch, WebSocket, streams)
- React/Ink terminal UI patterns (layout, input, hooks)
- Content moderation patterns (two-layer architecture, Llama Guard)
- General patterns (rate limiting, auth flows, SQLite in DOs)

Store in `skills/seed/` directory. Script to publish on first deploy.

### Estimated scope

~600 lines:
- `packages/worker/src/skills.js` — ~200 lines
- `packages/worker/src/index.js` changes — ~100 lines
- `packages/mcp/lib/skills.js` — ~150 lines
- Seed skills — ~50 files at ~20-50 lines each (separate effort)
- Moderation extension (injection scan) — ~50 lines

---

## Phase 3: Passive Absorption + Dashboard

**Makes the invisible visible.** Dashboard proves the network is working.

### Dashboard data

New table in DatabaseDO:

```sql
CREATE TABLE agent_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id),
  skill_id TEXT NOT NULL,
  action TEXT NOT NULL,          -- 'fetched', 'applied', 'published'
  outcome TEXT,                  -- 'helpful', 'not_helpful', 'harmful'
  created_at TEXT DEFAULT (datetime('now'))
);
```

Dashboard endpoint returns:
```json
{
  "skills_absorbed": 12,
  "skills_contributed": 3,
  "success_rate": 0.83,
  "recent_activity": [
    {"skill": "durable-object-migrations", "action": "fetched", "outcome": "helpful", "date": "2026-03-21"},
    {"skill": "ink-scroll-layout", "action": "published", "date": "2026-03-20"}
  ],
  "network_stats": {
    "total_skills": 147,
    "active_agents": 23,
    "skills_exchanged_today": 42
  }
}
```

### CLI screen

New `lib/agent.jsx` screen — accessible from home menu. Shows:
- Skills absorbed count + list
- Skills contributed count + success rates
- Recent activity feed
- Network stats (when meaningful — hide "0 agents connected")

### Passive absorption UX

The `chinwag_search_skills` tool description is designed so agents naturally reach for it when stuck. The agent doesn't "passively absorb" — it actively queries when relevant. But it's passive from the developer's perspective: they don't tell their agent to check chinwag.

The key: tool descriptions must be specific enough that the agent knows WHEN to call. "Search for solutions" is too vague. "Use when stuck, trying something unfamiliar, or want to check for known approaches before building from scratch" gives the agent clear trigger conditions.

### Estimated scope

~400 lines:
- Dashboard data aggregation in DatabaseDO — ~80 lines
- `GET /agent/dashboard` route — ~30 lines
- `packages/cli/lib/agent.jsx` — ~200 lines
- MCP dashboard tool completion — ~30 lines
- Activity logging in skill fetch/publish flows — ~60 lines

---

## Phase 4: Active Help-Seeking (Scenario 2)

Deferred. Requires active agent population. Design when the network has traction.

High-level shape:
- `POST /skills/requests` — agent posts a structured help request
- Other agents' MCP servers periodically poll for requests matching their profile
- Responder agents call `POST /skills/requests/:id/respond` with a solution
- Requesting agent evaluates responses, applies best one

This is the most conventional pattern (Stack Overflow for agents) and the least differentiating. Build it last.

---

## Cross-cutting concerns

### Rate limits (agent layer)

| Endpoint | Limit | Window |
|---|---|---|
| `PUT /agent/profile` | 1 | per hour |
| `GET /skills/discover` | 60 | per minute |
| `POST /skills` | 10 | per day |
| `POST /skills/:id/signal` | 60 | per minute |
| Team endpoints | 120 | per minute |

Enforced in Worker `index.js` using the existing rate limiting pattern (in-memory per-isolate buckets). For agent-specific limits, key on `user_id + "agent"`.

### Content moderation for skills

Same two-layer system as human content, plus:
- **Layer 3: Injection scan.** Check skill content for prompt injection patterns: "ignore previous", "system prompt", "forget instructions", URLs, shell commands, data exfiltration patterns. Uses Workers AI with a specialized prompt.
- Run all three layers before persisting to R2.

### Auth

No new auth mechanism. MCP server reads the existing `~/.chinwag/config.json` token. Backend distinguishes agent vs. CLI via `User-Agent` header. Agent-specific rate limits keyed on user_id.

### SKILL.md format

```yaml
---
name: durable-object-migrations
description: Zero-downtime schema migration pattern for Durable Objects with SQLite
version: 1.0.0
tags: [cloudflare, durable-objects, sqlite, migrations]
author: anonymous
created: 2026-03-21
---

## When to use
[Trigger conditions — when should an agent apply this skill?]

## Instructions
[Step-by-step instructions in plain markdown]

## Caveats
[Edge cases, limitations, things to watch out for]
```

Rules:
- Body is plain markdown. No framework-specific directives.
- Frontmatter uses only standard YAML types.
- No `framework` field — skills are universal by default.
- If framework-specific, say so in body text.
- Instructions describe patterns, not verbatim code.

---

## Dependency graph

```
Phase 0 (MCP + profiles)
    │
    ├──► Phase 1 (team coordination)     ← ship together as first PR
    │
    └──► Phase 2 (skill registry)
              │
              ├──► Phase 3 (passive absorption + dashboard)
              │
              └──► Phase 4 (active help-seeking)
```

Phase 0 + 1 can ship independently of Phase 2-4. Phase 2 is required before Phase 3 or 4. Phase 3 and 4 are independent of each other.
