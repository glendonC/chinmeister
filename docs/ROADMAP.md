# Roadmap

What is built and what comes next. For product vision, positioning, and differentiation, see [VISION.md](VISION.md).

---

## What is shipped

### Connect, Remember, Coordinate

`npx chinwag init` in a project, and every agent session shares a brain with the team.

- **`chinwag init`:** Tool detection via registry, MCP config writing, team creation or join, Claude Code hooks and channel
- **Claude Code deep integration:** PreToolUse conflict blocking, PostToolUse edit tracking, SessionStart context injection, channel push with state diffing
- **Shared project memory:** Save and get with categories, deduplication, count-based auto-prune (500 per team)
- **Agent operations dashboard (TUI):** Active agents, file conflicts, recent sessions, team knowledge, 5s polling
- **Cross-tool MCP support:** Instructions field, tool descriptions, pull-on-any-call preamble
- **Session observability:** Lifecycle tracking, edit recording, stuckness detection (15 min threshold)

### Tool Integration

- **Tool catalog API** (`GET /tools/catalog`): AI dev tools, served from worker
- **`chinwag add <tool>`:** One-command MCP config from the CLI
- **TUI discover screen:** Configured tools, recommendations, category browsing

### Chat (secondary)

Global chat rooms, presence, handle and color customization, content moderation

### Security

Membership checks on all team endpoints, team ID entropy, rate limits, input validation, fetch timeouts, retry with backoff

### Landing page and web dashboard

- **chinwag.dev:** Responsive site, Open Graph and Twitter meta, install command
- **Dashboard** ([chinwag.dev/dashboard](https://chinwag.dev/dashboard)): Authenticated workflow view, embeddable in IDE panels, per-project and cross-project summaries (`GET /me/teams`, `GET /me/dashboard`)

### Process management (two-tier agent model)

Managed CLI agents with full lifecycle control, connected IDE agents with coordination only.

- **`lib/process-manager.js`:** Spawn CLI agents via node-pty, track PIDs, kill/restart
- **`chinwag run "task description"`:** Spawn a managed agent with a task from CLI
- **`[n]` new agent flow in TUI dashboard:** Pick tool, enter task, spawn
- **`[x]` stop on managed agents in dashboard**
- **Managed vs connected agent distinction:** Agent type, spawn source, PID tracking
- **Dashboard unified agent list:** Managed agents show stop/restart controls, connected agents show activity only
- **Process exit handling:** Cleanup on crash, report session end, surface exit status

### Session Intelligence (foundation)

The data layer for workflow intelligence is in place. Not yet surfaced as analytics, but captured and queryable.

- **Per-session tracking:** duration, edit count, files touched, conflicts hit, model used, host tool
- **Stuckness detection:** 15-min heartbeat gap triggers alerts via channel
- **Claude Code hooks:** automatic edit capture (PostToolUse), enforced conflict checks (PreToolUse), context injection (SessionStart)
- **Session history API:** `GET /teams/:id/sessions` returns recent sessions with full metadata

### Tests and CI

- **Unit tests:** MCP server tools, CLI config generation, worker API endpoints (vitest)
- **GitHub Actions workflow:** Lint, test, build across all packages

---

## What is next

### Phase 1 — Polish: harden what we shipped

The core works. Before adding surface area, make it bulletproof.

- [ ] Test MCP integration with Cursor, Windsurf, VS Code Copilot, Codex CLI, Aider, JetBrains (verify behavior, document quirks)
- [x] Replace polling with WebSocket push (channel and dashboard receive real-time delta events from TeamDO; HTTP polling retained as fallback and reconciliation safety net)
- [ ] CORS origin checking (currently `*`; tighten when dashboard auth hardens)
- [ ] Tool usage telemetry: record which tools users configure to prioritize integrations
- [ ] Publish `chinwag` CLI and `chinwag-mcp` packages to npm
- [ ] End-to-end test: `npm install -g chinwag` → `npx chinwag init` → agent connection

### Phase 2 — Workflow Intelligence: surface what we capture

The session data foundation is shipped. Now make it visible and actionable.

- [ ] Session analytics views in web dashboard and TUI: duration trends, edit velocity, file scope, retry patterns over time
- [ ] Session outcome tracking: `chinwag_report_outcome` MCP tool (completed/abandoned/failed) + inference from session signals (stuckness → end = likely failed, normal end = likely completed)
- [ ] Edit diff stats via Claude Code hooks: lines added/removed per edit (not content — privacy-safe size metrics)
- [ ] File edit heatmaps: aggregate files_touched across sessions into codebase visualization showing AI activity density
- [ ] Git attribution: link commits to agent sessions by correlating `git log --since` with session windows — direct measure of agent output
- [ ] Project lenses (foundation): structured result types in memory (typed reports, not just text) so lenses can query "last security audit score" or "test coverage trend"
- [ ] Project lenses (UI): security, test, architecture, documentation views with action buttons to spawn agents
- [ ] Proactive insights: surface stuckness hotspots, retry-heavy areas, audit staleness based on accumulated session data

### Phase 3 — Advanced control

- [ ] Hook-based pause/resume for Claude Code agents (PreToolUse hook returns pause signal)
- [ ] Advisory stop signals for connected IDE agents (message via MCP context that agents read and follow)
- [ ] Agent output streaming in TUI (split pane or dedicated view for managed agent stdout)
- [ ] `chinwag spawn` for headless/background agents (no terminal needed, output logged)
- [ ] `node-pty` capture for web-spawned managed agents (replace detached stdio:ignore spawn with terminal capture)

---

## Explore later

Revisit once intelligence foundation is solid and adoption signals are clear.

- **Multi-project memory:** User-level preferences and patterns that span projects
- **Deeper tool hooks:** As tools beyond Claude Code add hook-like capabilities, deepen integration and analytics coverage
- **Cost/token estimation:** Proxy session cost from duration + model tier; explore provider API integrations if available

## Non-goals

See [VISION.md](VISION.md#what-chinwag-is-not).
