# Roadmap

chinwag is the operations layer for your team's AI agents. This doc tracks what's built, what's next, and what's deferred.

---

## What's shipped

### Phase 1 — Shared context + coordination (complete)

The goal: `npx chinwag init` in a project, and every agent session from that point forward is smarter because it shares context with the team. **Done.**

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

### Testing and CI
- [ ] Unit tests for MCP server tools (vitest)
- [ ] Integration tests for `chinwag init` → config generation → tool detection
- [ ] Hook simulation tests (fake stdin, verify output)
- [ ] Worker API endpoint tests
- [ ] GitHub Actions workflow: lint, test, build
- [ ] Linting setup (eslint)

### npm publishing
- [ ] Publish `chinwag` CLI package
- [ ] Publish `chinwag-mcp` package (MCP server + hooks + channel)
- [ ] End-to-end test: `npm install -g chinwag` → `npx chinwag init` → agent connection
- [ ] CI-triggered publish workflow

### Cross-tool validation
- [ ] Test MCP integration with Cursor, Windsurf, VS Code Copilot, Codex CLI, Aider, JetBrains
- [ ] Document tool-specific quirks or limitations

---

## Phase 3 — Optimization intelligence

### Overlap and efficiency detection
- [ ] Detect when two agents are doing redundant work
- [ ] Suggest consolidation ("Agents A and B are both refactoring auth — consider merging")
- [ ] Detect coverage gaps ("No agent has touched tests in 3 days — test/code ratio dropped 15%")

### Agent lifecycle management
- [ ] Suggest spinning up new agents for uncovered areas
- [ ] Auto-provision agents with the right context pre-loaded from team memory
- [ ] Suggest killing agents that aren't producing value

---

## What's deferred

These ideas came up during product design but aren't being built now. Kept here for reference.

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

---

## Architecture notes

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full system design. Key points for roadmap work:

- **MCP server** (`packages/mcp/`) is the primary product interface. It runs locally per agent session, connecting to the backend with the user's auth token.
- **TeamDO** is the coordination hub — membership, activity, conflicts, shared memory, and sessions all live here.
- **Claude Code hooks** enable enforced conflict prevention (PreToolUse blocks edits) and context injection (SessionStart injects team state). These are the highest-value integration points.
- **Claude Code channels** enable real-time push — the channel server polls for team state changes and pushes diffs into running sessions.
- **All DO communication uses RPC**, not fetch. New features should follow this pattern.
