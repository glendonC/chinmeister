# Roadmap

chinwag is the control layer for agentic development. Connect your AI tools, share a brain across all of them, coordinate across teammates, and see your entire workflow in one place. This doc tracks what's built, what's next, and what's deferred.

## The five pillars

1. **Connect** — Detect tools, write configs, hook everything up. One command.
2. **Remember** — Shared memory across tools, sessions, and teammates.
3. **Coordinate** — Live awareness, conflict prevention, cross-tool and cross-teammate.
4. **Discover** — Browse AI dev tools, see what fits, add with one action.
5. **Observe** — See what agents are doing across all tools and projects.

## Who it's for

- **Solo devs with multiple AI tools** across 1-3 active projects
- **Small teams (2-5 devs)** sharing a repo, each using their preferred tools
- **Team leads** who need visibility into their team's AI workflow

---

## What's shipped

### Phase 1 — Shared memory + coordination (complete)

The goal: `npx chinwag init` in a project, and every agent session from that point forward shares a brain with the team. **Done.**

#### `chinwag init` command
- [x] Detect installed tools via declarative registry (`packages/cli/lib/tools.js`) — Claude Code, Cursor, Windsurf, VS Code, Codex, Aider, JetBrains, Amazon Q
- [x] Write MCP config files for each detected tool (`.mcp.json`, `.cursor/mcp.json`, `.windsurf/mcp.json`, `.vscode/mcp.json`, `.idea/mcp.json`)
- [x] Create team and write `.chinwag` file (or join existing team if `.chinwag` exists)
- [x] For Claude Code: write hooks config to `.claude/settings.json` (PreToolUse on Edit/Write, PostToolUse on Edit/Write, SessionStart for context injection)
- [x] For Claude Code: configure chinwag channel for real-time push
- [x] Clear output showing what was configured and what happens next

#### Claude Code deep integration
- [x] **Channel server:** Pushes team state changes into running Claude Code sessions with state diffing (joins, leaves, file activity, conflicts, stuckness, new memories)
- [x] **PreToolUse hook:** `chinwag-hook check-conflict` — checks backend before every Edit/Write, blocks if another agent is in the file, returns reason
- [x] **PostToolUse hook:** `chinwag-hook report-edit` — reports file edit to backend after every Edit/Write (activity + session tracking in parallel)
- [x] **SessionStart hook:** `chinwag-hook session-start` — injects full team context at session start (active agents, what they're editing, recent memory, stuckness insights)
- [x] Graceful degradation when backend is unreachable (allow edit, log warning)

#### Shared project memory
- [x] `chinwag_save_memory` MCP tool — agent saves a project fact with category (gotcha, pattern, config, decision, reference)
- [x] `chinwag_get_team_context` MCP tool — returns relevant memories for the current session
- [x] Storage in TeamDO SQLite — memory text, source agent, timestamp, category, relevance score
- [x] Deduplication on write (lowercase normalized comparison)
- [x] Staleness decay — 7-day grace period, then 0.1 relevance drop per day, pruned below 0.1 minimum
- [x] Auto-prune to 100 memories per team
- [x] Memory surfaced via MCP instructions field and pull-on-any-call preamble

#### Agent operations dashboard (CLI)
- [x] `lib/dashboard.jsx` screen with 5s polling
- [x] Display per agent: tool type (framework), active files, task summary, session duration
- [x] Display per team member: their agents and what they're working on
- [x] Conflict warnings inline (detects 2+ agents on same file)
- [x] Project memory view — team knowledge base with categories
- [x] Recent activity — sessions from last 24 hours with edit count, files, conflicts, duration

#### Cross-tool MCP support
- [x] MCP `instructions` field in server initialize response — tells agents to check chinwag before editing
- [x] Well-crafted tool descriptions that guide agents to use chinwag tools reliably
- [x] Pull-on-any-call pattern — every tool response includes latest team state as preamble
- [ ] Test with Cursor, Windsurf, VS Code Copilot, Codex CLI, Aider, and JetBrains to verify behavior

### Phase 2 — Observability (complete)

#### Session observability
- [x] Sessions table: agent_id, framework, started_at, ended_at, edit_count, files_touched, conflicts_hit, memories_saved
- [x] Auto-start session on MCP server join, auto-end on SIGINT/SIGTERM
- [x] Record edits via PostToolUse hook (increments edit_count, appends to files_touched)
- [x] Session history API: `GET /teams/{teamId}/history?days={N}` (1-30 day range, max 50 records)
- [x] Duration calculated in SQL: `julianday(ended_at) - julianday(started_at)`
- [x] Auto-prune sessions older than 30 days

#### Stuckness detection
- [x] Channel server detects when an agent has been on the same task for 15+ minutes
- [x] Alerts once per activity change (deduplication by `updated_at` timestamp)
- [x] SessionStart hook also flags stuckness on join

#### Activity history
- [x] Dashboard recent activity section shows sessions from last 24 hours
- [x] Per-session: handle, framework, duration, edit count, file count, conflicts hit, ended status
- [x] History API supports configurable day range

### Chat and accounts (shipped, secondary)
- [x] Global chat rooms with auto-sizing (~20 users per room)
- [x] Presence heartbeat (30s interval, 60s TTL)
- [x] Handle customization, 12-color palette, status
- [x] Two-layer content moderation (blocklist + Llama Guard 3)
- [x] 5-minute cooldown for new accounts before chat access

### Landing page (shipped)
- [x] chinwag.dev with section navigation, responsive design
- [x] OpenGraph and Twitter Card meta tags for social sharing
- [x] Install command with copy-to-clipboard

### Security hardening (shipped)
- [x] Membership verification on all team data endpoints
- [x] Team IDs with 64-bit entropy (enumeration resistance)
- [x] WebSocket identity verification via internal header
- [x] Session ownership enforcement on endSession()
- [x] Rate limits: account creation (3/day/IP), team creation (5/day/user), memory saves (20/day/user), chat (10/min/user)
- [x] Fetch timeouts (10s) on MCP and CLI API clients
- [x] Retry with exponential backoff on CLI API transient failures
- [x] Zod input validation on MCP tools matching backend limits
- [x] Error boundary in CLI to catch screen render crashes

---

## What's next

### Discover — Tool discovery + catalog (Pillar 4)
- [x] Expand tool catalog to ~25 AI dev tools with rich metadata (description, category, website, install command, MCP compatibility)
- [x] Split registry: `MCP_TOOLS` (CLI, config writing) + tool catalog API (`GET /tools/catalog`, single source of truth)
- [x] TUI discover screen: shows your configured tools, recommends tools you're missing, browse by category
- [x] `chinwag add <tool>` command: add a specific tool's MCP config without opening the TUI, fetches catalog from API
- [ ] Enhance dashboard with "Your Workflow" section showing configured tools

### Observe — Web dashboard (Pillar 5)
The web app evolves from a landing page into a real workflow dashboard. This is how you see everything across all projects and teammates.
- [ ] Authenticated web dashboard (login via chinwag token or OAuth)
- [ ] Cross-project view: see all your projects, which agents are running, what they're working on
- [ ] Per-project view: team members, their agents, file activity, conflicts, shared memory
- [ ] Tool discovery in the browser: browse catalog, one-click add, see what teammates use
- [ ] Session history and stuckness visibility across all projects

### Coordinate — Multi-project support (Pillar 3)
Solo devs work on multiple projects. Teams work across repos. chinwag should give a unified view.
- [ ] User-level API: list all teams/projects a user belongs to
- [ ] Cross-project dashboard: see all agents across all projects in one view
- [ ] User-level memory: preferences and patterns that span projects (e.g., "always use vitest")
- [ ] Project switching in TUI: navigate between projects without restarting

### Connect — Deeper integrations (Pillar 1)
- [ ] Test MCP integration with Cursor, Windsurf, VS Code Copilot, Codex CLI, Aider, JetBrains
- [ ] Document tool-specific quirks or limitations
- [ ] As tools add hook-like capabilities, deepen integration beyond MCP advisory

### Ship — Testing, CI, npm
- [ ] Unit tests for MCP server tools (vitest)
- [ ] Integration tests for `chinwag init` → config generation → tool detection
- [ ] Hook simulation tests (fake stdin, verify output)
- [ ] Worker API endpoint tests
- [ ] GitHub Actions workflow: lint, test, build
- [ ] Linting setup (eslint)
- [ ] Publish `chinwag` CLI package
- [ ] Publish `chinwag-mcp` package (MCP server + hooks + channel)
- [ ] End-to-end test: `npm install -g chinwag` → `npx chinwag init` → agent connection
- [ ] CI-triggered publish workflow

---

## Explore later

These ideas follow naturally from the data chinwag collects. Revisit once the five pillars are solid and adoption signals are clear.

### Workflow intelligence
- [ ] Detect when two agents are doing redundant work, suggest consolidation
- [ ] Detect uncovered areas ("No agent has touched tests in 3 days")
- [ ] Cross-team insights: "Teams using Tool X with your stack see fewer conflicts"
- [ ] Smart memory suggestions: surface relevant memories from other projects when patterns match
- [ ] Stuckness resolution: "A teammate's agent solved something similar — here's the memory"

---

## What's deferred

These ideas came up during product design but aren't being built now. Kept here for reference. The principle: make the core experience (shared memory + coordination) flawless before adding surface area.

### Cost and usage tracking
Originally Phase 2. Deferred because MCP does not currently expose token consumption or model identity from agent sessions — there is no way for the MCP server to know how many tokens an agent used or which model it ran on. Revisit when the MCP protocol adds usage reporting, or when individual tools (Claude Code, Cursor) expose this data through their own APIs.

### Persistent binary references (R2)
Storing images, designs, and binary assets that agents need across sessions (not just text memories). Requires R2 integration for binary storage + TeamDO metadata. Text references are already supported via the `reference` memory category. Binary storage deferred until there's clear demand.

### Developer community as primary product
Originally chinwag was positioned as "your dev home in the terminal" — equal parts agent dashboard and developer community. Research showed that bundling social + utility as co-equal products dilutes focus and creates a cold-start problem for the community side. Daily notes and exchange matching were removed in the product pivot. Chat remains available but secondary.

### Network memory (cross-user patterns)
Aggregating anonymized signals across all users to produce patterns no individual agent has. Dropped because: privacy model unclear, contribution mechanism unproven, competes with LLM training data for generic patterns.

### Skill network / ClawHub competitor
Publishing and discovering SKILL.md instruction files. Was prototyped but code was removed. Static skill registries are commoditized.

### Passive skill absorption
Agents automatically finding and applying network patterns. Too many dependencies on unbuilt pieces.

### Agent lifecycle management
Auto-provisioning agents, suggesting new agents for uncovered areas, killing unproductive agents. This is agent orchestration — a different product from agent coordination. The orchestration space is crowded (ComposioHQ, Claude Squad, Overstory, etc.). chinwag's value is the neutral cross-tool layer, not managing agent lifecycles.

---

## Architecture notes

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full system design. Key points for roadmap work:

- **MCP server** (`packages/mcp/`) is the product. It runs locally per agent session, connecting to the backend with the user's auth token. Every feature should be MCP-first.
- **TeamDO** is the coordination hub — membership, activity, conflicts, shared memory, and sessions all live here.
- **Claude Code hooks** enable enforced conflict prevention (PreToolUse blocks edits) and context injection (SessionStart injects team state). This is the deepest integration — other tools get softer MCP-based awareness.
- **All DO communication uses RPC**, not fetch. New features should follow this pattern.

## Non-goals

Things chinwag is explicitly **not**:

- **Not an agent orchestrator.** chinwag doesn't spawn, assign, or manage agent processes. Tools like ComposioHQ, Claude Squad, and Overstory do that. chinwag connects and coordinates agents that are already running independently in their native tools.
- **Not an APM / standalone observability platform.** Observation exists to support the workflow — stuckness detection, activity awareness, team visibility. It's a pillar of the product, not a separate monitoring product.
- **Not a community platform.** Chat exists but is secondary. chinwag's value is the five pillars, not developer social features.
- **Not a replacement for CLAUDE.md or AGENTS.md.** Those are per-tool static instructions. chinwag is dynamic shared memory and real-time coordination across tools.
- **Not an MCP server registry.** Smithery, Glama, and PulseMCP are MCP server marketplaces. chinwag's discover pillar is about AI dev tools for your workflow, not arbitrary MCP servers.
