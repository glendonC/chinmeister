# chinmeister

**The control layer for agentic development.**
One command connects every AI coding tool on your machine — shared memory, live coordination, conflict prevention, workflow visibility.

[![CI](https://github.com/glendonC/chinmeister/actions/workflows/ci.yml/badge.svg)](https://github.com/glendonC/chinmeister/actions/workflows/ci.yml)
· MIT client · BSL 1.1 backend · Node 22+

---

```text
 ┌───────────────────────────────────────────────────────┐
 │                                                       │
 │   demo gif pending. currently filming:                │
 │                                                       │
 │     1. npx chinmeister init                           │
 │     2. two agents join the same team                  │
 │     3. one tries to edit auth.js                      │
 │     4. the other gets blocked mid-edit                │
 │                                                       │
 │   the TUI keeps doing something cool and we can't     │
 │   stop watching it ourselves. back with a gif soon.   │
 │                                                       │
 └───────────────────────────────────────────────────────┘
```

---

## Why chinmeister

Every AI coding tool coordinates only with itself. Claude Code coordinates Claude Code. Cursor coordinates Cursor. Run both on the same project and they're strangers — no shared memory, no conflict prevention, no unified view. Add a teammate running Windsurf and it gets worse.

No vendor is incentivized to fix this. Anthropic won't help Cursor; Cursor won't help Anthropic. The space between tools stays empty.

chinmeister is the thing in that space. One MCP server, one coordination network, every agent.

## Quick start

```bash
npx chinmeister init
```

That's it. chinmeister detects your AI tools, writes their MCP configs, and creates a team for your project. Every agent you run after that shares a brain with the others.

**Works today:** Claude Code · Cursor · Windsurf · VS Code (Copilot, Cline, Continue) · Codex CLI · Aider · JetBrains · Amazon Q.

## What it does

### Connect

`chinmeister init` finds every supported tool on your machine and wires it up. `chinmeister add <tool>` picks up new ones as you try them. No per-tool config to maintain by hand.

> _[discover-screen screenshot coming — currently negotiating with the CSS about what "aligned" means]_

### Remember

Agents share project memory across every tool and every teammate. What one agent learns — "tests require Redis", "deploy needs AWS_REGION=us-west-2", "the retry logic in `queue.ts` is subtle, don't simplify it" — every agent knows next session. Tagged, queryable, editable by agents and humans. Not a black box.

### Coordinate

Every agent across every tool sees every other agent in real time. Two agents opening the same file? Claude Code's hooks block it before the edit commits. Other tools get advisory warnings through MCP. Cross-machine, cross-vendor, cross-human.

> _[TUI conflict-prevention screenshot — coming once we settle on a color that means "wait, don't"]_

### Observe

Every session tracked — duration, edits, files, tokens, cost, outcome, conversation sentiment for managed agents. Four lenses: the individual session, the project (this repo, this team), the developer (you across all projects), the team (your people, their agents, how they're doing).

> _[dashboard screenshot — pending, staring at a blank canvas and we blinked first]_

## Supported tools

| Tool                                 | Tier      | Integration                                    |
| ------------------------------------ | --------- | ---------------------------------------------- |
| Claude Code                          | Managed   | Hooks + channel push + full process control    |
| Codex CLI                            | Managed   | MCP tools + process control                    |
| Aider                                | Managed   | MCP tools + process control                    |
| Cursor                               | Connected | MCP tools + instructions, pull-based awareness |
| Windsurf                             | Connected | MCP tools + instructions, pull-based awareness |
| VS Code (Copilot / Cline / Continue) | Connected | MCP tools + instructions                       |
| JetBrains                            | Connected | MCP tools via `.idea/mcp.json`                 |
| Amazon Q                             | Connected | MCP tools                                      |

**Managed** means chinmeister can spawn, stop, and restart the agent; you get deep session analytics. **Connected** means the IDE owns lifecycle; chinmeister handles coordination and memory. Both tiers appear in the same dashboard. Claude Code has the deepest integration because it supports hooks (enforceable conflict prevention) and channels (server-initiated push). Other tools deepen as their platforms add hook-like capabilities.

## Shipping next

> **Reports surface.** Three foundational reports — _Failures_ (where agents keep failing and why), _Collisions_ (where they step on each other, where tool handoffs break), _Project Primer_ (what a new person or agent needs to know about this repo). Scheduled cadences plus run-on-demand. Observability first, no remediation yet.
>
> **Autopilot.** Reports that propose fixes, not just findings. Memory Hygiene → Doc Drift → Test Gap (failure-weighted) → Retry Hotspots → Dead Code. Each finding ships with a one-click action: chinmeister mutates its own state, drafts a file for your review, or hands a pre-loaded task to your own agent to execute. Your agent, your credits, your repo — chinmeister proposes, your trusted tools execute.
>
> **Async awareness.** Push notifications and weekly digests on your phone. Know how your agents did overnight without opening anything. Team leads feel the shape of their team's AI workflow without staring at graphs.

See [docs/ROADMAP.md](docs/ROADMAP.md) for the full plan and sequencing.

## Teams

The `.chinmeister` file gets committed to git. When a teammate clones and runs `npx chinmeister init`, they auto-join the same team. Every agent across every teammate shares memory, gets conflict prevention, and shows up in the same dashboard. One team per project. One account across projects, so your personal view spans every repo you work on.

## How it works

Monorepo, five packages:

- **`packages/mcp`** — MCP server that runs alongside each agent session. Stdio transport, invisible after setup.
- **`packages/worker`** — Cloudflare Workers backend. Durable Objects for team state and data, KV for auth lookups.
- **`packages/cli`** — Ink-based TUI + setup commands + managed-agent process control.
- **`packages/shared`** — Wire contracts, tool registry, integration helpers. Shared across every surface.
- **`packages/web`** — React 19 dashboard + landing page on Cloudflare Pages.

Three surfaces, one backend. No surface gets special treatment. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full map — data flow, invariants, design decisions.

## Licensing

Dual-licensed.

- **Client packages** (`mcp`, `cli`, `shared`) — **MIT**. Open source, auditable, fork-friendly. These run inside your environment alongside your agents; anything less than a permissive license would be a trust barrier.
- **Backend packages** (`worker`, `web`) — **BSL 1.1**. Source-available, self-hostable for internal use, cannot be offered as a competing hosted service. Converts to **Apache 2.0** on 2030-04-10.

Precise wording matters: chinmeister is _"dual-licensed: open source client, source-available backend (converting to open source in 2030)."_ Not "open source" as a whole — that framing burned Redis and Elastic, and it'd be wrong here too. Full terms and reasoning in [LICENSING.md](LICENSING.md).

## Commands

```bash
npx chinmeister init              # Setup: account + team + tool configs
npx chinmeister add <tool>        # Add a specific tool
npx chinmeister add --list        # Browse the catalog
npx chinmeister dashboard         # Open the web dashboard in your browser
npx chinmeister token             # Print the active auth token
npx chinmeister                   # TUI: dashboard, discover, chat, settings
```

For the bare `chinmeister` command, install globally:

```bash
npm install -g chinmeister
```

> _[npm publish is imminent — currently double-checking that nothing embarrassing made it past prettier]_

## Development

```bash
npm run dev:local         # Full local stack: worker + web + isolated local auth
npm run dev:cli           # Build + run CLI
npm run dev:worker        # Worker dev server
npm run dev:web           # Web dashboard
npm run deploy            # Deploy worker to production
```

`dev:local` keeps local work isolated from production — local worker, local dashboard, `~/.chinmeister/local/config.json`. See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) for setup, code style, testing, and PR process.

## Contributing · Security · License

- [Contributing guide](docs/CONTRIBUTING.md) — setup, code style, conventional commits, PR process
- [Security policy](SECURITY.md) — responsible disclosure, threat model, safe harbor
- [License terms](LICENSING.md) — MIT + BSL 1.1, converts to Apache 2.0 in 2030

---

_Built for developers who run more than one AI tool and would like them to talk to each other._
