# Roadmap

chinwag is the operations layer for your team's AI agents. This doc tracks what's built, what's next, and what's deferred.

---

## What's built

### Agent infrastructure (shipped)
- MCP server (`packages/mcp/`) — connects AI agents via stdio transport
- Agent profiles in DatabaseDO — auto-detected from environment (languages, frameworks, tools, platforms)
- Team coordination (TeamDO) — membership, activity tracking, file conflict detection, heartbeat
- CLI team commands — `chinwag team create`, `chinwag team join <id>`
- `.chinwag` file for auto-join on MCP server startup
- 8 API routes for agent profile and full team CRUD

### Chat and accounts (shipped, secondary)
- Global chat rooms with auto-sizing (~20 users per room)
- Presence heartbeat (30s interval, 60s TTL)
- Handle customization, 12-color palette, status
- Two-layer content moderation (blocklist + Llama Guard 3)

### Landing page (shipped)
- chinwag.dev with install switcher, section navigation, theme toggle

---

## Phase 1 — Shared context + coordination (current)

The goal: `npx chinwag init` in a project, and every agent session from that point forward is smarter because it shares context with the team.

### 1. `chinwag init` command
**Zero-friction setup.** One command configures everything.

- [ ] Detect installed tools via declarative registry (`packages/cli/lib/tools.js`) — Claude Code, Cursor, Windsurf, VS Code, Codex, Aider, JetBrains, Amazon Q
- [ ] Write MCP config files for each detected tool (`.mcp.json`, `.cursor/mcp.json`, `.windsurf/mcp.json`, `.vscode/mcp.json`, `.idea/mcp.json`)
- [ ] Create team and write `.chinwag` file (or join existing team if `.chinwag` exists)
- [ ] For Claude Code: write hooks config to `.claude/settings.json` (PreToolUse on Edit/Write, SessionStart for context injection)
- [ ] For Claude Code: configure chinwag channel for real-time push
- [ ] Clear output showing what was configured and what happens next

### 2. Claude Code deep integration
**Enforced conflict prevention + real-time awareness.** The best experience on the best tool.

- [ ] **Channel server:** Build chinwag channel that pushes team state changes into running Claude Code sessions ("Agent @sarah started editing src/auth.js")
- [ ] **PreToolUse hook:** `chinwag-hook check-conflict` — checks backend before every Edit/Write, blocks if another agent is in the file, returns reason
- [ ] **PostToolUse hook:** `chinwag-hook report-edit` — reports file edit to backend after every Edit/Write, keeps team state current
- [ ] **SessionStart hook:** `chinwag-hook session-start` — injects full team context at session start (active agents, what they're editing, recent memory)
- [ ] Graceful degradation when backend is unreachable (allow edit, log warning)

### 3. Shared project memory
**Knowledge persists across sessions and across people.** Your agents stop re-discovering the same things.

- [ ] `chinwag_save_memory` MCP tool — agent saves a project fact with category (gotcha, pattern, config, decision)
- [ ] `chinwag_get_team_context` MCP tool — returns relevant memories for the current session
- [ ] Storage in TeamDO SQLite — memory text, source agent, timestamp, category, relevance score
- [ ] Deduplication on write (don't store "tests need Redis" twice)
- [ ] Staleness decay — memories lose relevance score over time, eventually pruned
- [ ] Memory surfaced via MCP `instructions` field at session start

**Open question:** How much should be auto-captured vs. explicit? Start with explicit (`chinwag_save_memory` tool), add auto-capture in Phase 2 based on what people actually save.

### 4. Agent operations dashboard (CLI)
**Optional human view.** See your whole agent fleet at a glance.

- [ ] New `lib/dashboard.jsx` screen — default view when running `npx chinwag`
- [ ] Display per agent: tool type, active files, task summary, model, session duration
- [ ] Display per team member: their agents and what they're working on
- [ ] Conflict warnings inline
- [ ] Project memory view — what the team's knowledge base contains
- [ ] Poll team endpoint for live updates

### 5. Cross-tool MCP support
**All non-Claude-Code tools get good (not perfect) awareness.**

- [ ] MCP `instructions` field in server initialize response — tells agents to check chinwag before editing
- [ ] Well-crafted tool descriptions that guide agents to use chinwag tools reliably
- [ ] Pull-on-any-call pattern — every tool response includes latest team state as preamble
- [ ] Test with Cursor, Windsurf, VS Code Copilot, Codex CLI, Aider, and JetBrains to verify behavior

---

## Phase 2 — Full observability

### 6. Cost and usage tracking
- [ ] Track tokens consumed per agent session (reported by MCP server)
- [ ] Track model used per session
- [ ] Aggregate cost per developer, per tool, per day
- [ ] Dashboard view: "You've spent $X today across N agents"
- [ ] Team-level cost breakdown

### 7. Persistent external references
- [ ] Store non-code references (images, designs, links, docs) that agents need across sessions
- [ ] When context window compresses and drops a reference design, chinwag still has it
- [ ] MCP resource that serves stored references to agents
- [ ] Storage: R2 for binary assets, TeamDO for metadata and links

### 8. Activity history
- [ ] Log of all agent sessions: what was done, what files were touched, what was learned
- [ ] Searchable from dashboard
- [ ] Useful for understanding what agents have been doing overnight or while you were away

---

## Phase 3 — Optimization intelligence

### 9. Overlap and efficiency detection
- [ ] Detect when two agents are doing redundant work
- [ ] Suggest consolidation ("Agents A and B are both refactoring auth — consider merging")
- [ ] Detect coverage gaps ("No agent has touched tests in 3 days — test/code ratio dropped 15%")

### 10. Agent lifecycle management
- [ ] Suggest spinning up new agents for uncovered areas
- [ ] Auto-provision agents with the right context pre-loaded from team memory
- [ ] Suggest killing agents that aren't producing value

---

## What's deferred

These ideas came up during product design but aren't being built now. Kept here for reference.

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
- **TeamDO** is the coordination hub — membership, activity, conflicts, and shared memory all live here.
- **Claude Code hooks** enable enforced conflict prevention (PreToolUse blocks edits) and context injection (SessionStart injects team state). These are the highest-value integration points.
- **Claude Code channels** enable real-time push — the backend can notify a running Claude Code session about team state changes without the agent calling any tool.
- **All DO communication uses RPC**, not fetch. New features should follow this pattern.
