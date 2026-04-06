# Vision

What chinwag is, why it exists, and where it's going.

---

## The problem

Every AI coding tool coordinates only with itself. Claude Code coordinates Claude Code sessions. Cursor coordinates Cursor agents. GitHub coordinates GitHub agents. Each platform keeps building deeper multi-agent capabilities — but only for their own tools.

Meanwhile, real development looks like this: you run Claude Code and Cursor on the same project. Your teammate uses Windsurf. During a hackathon, five people each have multiple agents running. There is no shared memory between tools. There is no conflict prevention across them. There is no unified view of what's happening. Agents duplicate work, collide on files, and lose context across tools and sessions.

No vendor is incentivized to build cross-tool coordination — doing so would help their competitors. The space between tools stays empty.

Beyond coordination, there's a deeper gap: no developer has structured visibility into how they develop with AI. How effective are your agent sessions? Where do agents struggle in your codebase? Is your workflow improving over time? The tools themselves don't answer these questions — each session runs and disappears. There's no persistent view, no trend analysis, no feedback loop.

## What chinwag is

chinwag is the **control and intelligence layer for agentic development**: vendor-neutral infrastructure that connects AI tools, coordinates agents, and gives you deep visibility into your development workflow — from real-time agent coordination to long-term patterns in how you build with AI.

One command (`npx chinwag init`) connects your stack. From that point, agents share a brain, coordinate across tools and teammates, and your entire AI-assisted workflow becomes observable and improvable.

## What it does

### Coordination

Cross-vendor, cross-developer, real-time agent coordination.

- **Shared project memory** across all tools and teammates. What one agent learns, every agent knows next session. Memory is infrastructure, not a black box — tagged, queryable, editable, and deletable by agents and humans. Every entry is source-attributed and searchable. Knowledge doesn't rot in flat files or disappear inside opaque tool state.
- **Live awareness** of every agent across every tool. See who is editing what, in real time.
- **Conflict prevention.** Agents know when they're about to collide on a file — before it happens. Enforced on Claude Code via hooks, advisory on other tools via MCP.
- **File locking and activity tracking.** Claim files, report activity, detect conflicts.
- **Cross-machine coordination.** Works across developers on different machines through the shared backend.

### Workflow Intelligence

Understand and improve how you develop with AI.

- **Session analytics.** Every agent session tracked — duration, edit velocity, file scope, outcome. See patterns evolve over time: not just what happened, but whether your workflow is improving.
- **Codebase heatmaps.** Where does AI touch your project most? Where do agents struggle, where are the blind spots? Your codebase through the lens of how AI interacts with it.
- **Project lenses.** View your project through different perspectives — security posture, test health, architecture quality, documentation freshness — each with actions to spawn an agent and address what you see.
- **Multi-project dashboard.** Your full AI workflow across all repos. Which projects are actively agent-developed, session distribution across tools, cross-project trends.
- **Proactive insights.** chinwag surfaces what you'd miss: a module where agents consistently struggle, an area that hasn't been audited since a major change, retry patterns that suggest a task needs different scoping.

## How it works

**Agents are the primary user.** The MCP server runs invisibly alongside each agent session. After `chinwag init`, it just works. Developers interact with chinwag indirectly: their agents are smarter because chinwag is connected.

**Three surfaces, one backend.** MCP server (for agents), TUI (for terminal users), web dashboard (for visual management). All hit the same API. No surface gets special treatment.

**Two-tier agent model.** CLI agents (Claude Code, Codex, Aider) can be managed: chinwag spawns, tracks, and controls their lifecycle. IDE agents (Cursor, Windsurf) are connected: full coordination via MCP, but the IDE owns lifecycle. Both appear in the same dashboard.

**One team per project, one account across projects.** The `.chinwag` file (committed to git) scopes a team to a repo. `~/.chinwag/config.json` gives each developer a cross-project identity. Teammates auto-join when they run `chinwag init` in a project that already has a `.chinwag` file.

**Integration depth scales with the tool.** Tools that support hooks (like Claude Code) get the richest experience: enforced conflict prevention, automatic edit tracking, and full session analytics. Tools connected via MCP get coordination, shared memory, and activity awareness. Every tool benefits; deeper integration unlocks deeper intelligence.

**Expand your stack as you go.** `chinwag add <tool>` integrates any supported AI tool — MCP config, hooks where supported, done.

## What chinwag is not

- **Not an agent orchestrator.** chinwag does not spawn, assign, or manage agent reasoning. It coordinates agents already running in their native tools.
- **Not a monitoring dashboard.** Workflow intelligence drives action — every insight connects to something you can do about it. chinwag is a cockpit, not a display.
- **Not a community platform.** Chat exists but is secondary.
- **Not a replacement for CLAUDE.md or AGENTS.md.** Those are static per-tool instructions. chinwag is dynamic shared memory and real-time coordination.

---

_For system design and code structure, see [ARCHITECTURE.md](ARCHITECTURE.md). For build status and tasks, see [ROADMAP.md](ROADMAP.md)._
