# Demo data

One source of truth for every fixture rendered in the dashboard. Picker
state, widget data, and Reports content all flow from here.

## How it works

1. The `?demo` URL flag (or any dev build) shows two surfaces:
   - **Popover**: the bottom-right scenario switcher (`components/DemoSwitcher`).
     Scope-aware: by default it shows only scenarios that affect the current
     view, with a "Show all" toggle. Grouped by category. Plain-English
     summaries.
   - **Browse page**: `/dashboard/demo` (`views/DemoView`). The full table
     of every scenario with category / dimensions / affects-views columns
     and chip filters. Use this to find the scenario for a case you don't
     yet know how to name.
2. Picking a scenario writes the id to the URL and dispatches a
   `chinmeister:demo-scenario-changed` event.
3. React hooks subscribe to that event and short-circuit their API
   calls when demo is active:
   - `useUserAnalytics` → `analytics`
   - `useConversationAnalytics` → `conversation`
   - `useTeamExtendedAnalytics` → `analytics` (project scope)
   - `useDemoReports` → Reports runs + findings (no fallback API yet)
4. Each scenario builder returns a `DemoData` quad covering all four. No
   widget reads from anywhere else.

## Files

| File              | Role                                                                                                                                                       |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scenarios.ts`    | Registry. `DemoData` shape, scenario builders, `getDemoData(id)`. The only file that needs editing to add a scenario that reuses existing fixture domains. |
| `baseline.ts`     | The "Healthy" payload for `UserAnalytics`. Build other scenarios by spreading + overriding from this.                                                      |
| `conversation.ts` | Healthy `ConversationAnalytics`.                                                                                                                           |
| `live.ts`         | Healthy live presence + `createEmptyLive()` for the no-presence case.                                                                                      |
| `reports.ts`      | Healthy Reports payload + `createEmptyReports()`. Runs and completed report content.                                                                       |
| `me.ts`           | User profile (`UserProfile`) and team list (`UserTeams`). Drives the auth store and the sidebar.                                                           |
| `dashboard.ts`    | Cross-team `DashboardSummary` + per-team `TeamContext` map. Drives the polling store (Overview + ProjectView + ToolsView).                                 |
| `global.ts`       | Global rank, global stats, session timeline. Drives the global views and session-detail drill.                                                             |
| `profiles.ts`     | Demo project/team identities used across files.                                                                                                            |
| `rng.ts`          | Deterministic helpers (day spines, seeded random). Keep scenarios stable across refreshes.                                                                 |
| `index.ts`        | Public surface. Components import from here, not from internal files.                                                                                      |

## What the toggle covers (centralization map)

When the bottom-right switcher's toggle is **on**, every consumer below reads
from the active scenario instead of the network. Writes silently no-op so
the user can interact with the UI without corrupting demo state. The next
poll/refresh reasserts the baseline.

| Surface                  | Hook / store                               | Demo slice                |
| ------------------------ | ------------------------------------------ | ------------------------- |
| Auth & profile           | `lib/stores/auth`                          | `me`                      |
| Sidebar team list        | `lib/stores/teams`                         | `teams`                   |
| Polling overview         | `lib/stores/polling` (no `activeTeamId`)   | `dashboard`               |
| Polling project          | `lib/stores/polling` (with `activeTeamId`) | `teamContexts[id]`        |
| Tools view               | `views/ToolsView/useToolsViewData`         | `dashboard` (via polling) |
| Overview analytics       | `hooks/useUserAnalytics`                   | `analytics`               |
| Conversation analytics   | `hooks/useConversationAnalytics`           | `conversation`            |
| Team analytics           | `hooks/useTeamExtendedAnalytics`           | `analytics`               |
| Reports                  | `hooks/useDemoReports`                     | `reports`                 |
| Global rank              | `hooks/useGlobalRank`                      | `globalRank`              |
| Global stats             | `hooks/useGlobalStats`                     | `globalStats`             |
| Session timeline         | `hooks/useSessionTimeline`                 | `sessions`                |
| Live presence (Overview) | `views/OverviewView` direct read           | `live`                    |

Two surfaces are intentionally **not** gated. They are listed here so
the carve-out is explicit, not buried in a pull request.

| Surface           | Where                    | Why it stays live                                                                                                                                         |
| ----------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tool catalog      | `lib/stores/toolCatalog` | Static metadata about supported tools, not user activity. Showing the real catalog in demo keeps tool detection and category copy honest.                 |
| GitHub OAuth link | `views/SettingsView`     | The link flow has external side effects. Demo mode surfaces an explicit error rather than silently no-opping, so the user is not confused by a fake link. |

ProjectView caveat: per-team `messages` and `memory_categories` are left
empty in the demo `teamContexts` because ProjectView does not consume
them. If a future widget reads either, populate them in `dashboard.ts`
alongside the other per-team fixtures.

Two events keep this in sync without a page reload:

- `chinmeister:demo-scenario-changed`: fired by the switcher. Hooks subscribe
  via `useDemoScenario`; stores listen at module level and re-run their
  loaders.
- Auth's listener handles three branches: real token in storage → re-auth
  in the new mode, no token + demo on → synthetic auth, no token + demo
  off → drop to unauthenticated.

If you add a new view that hits the network, follow the same pattern. The
rule: **no read path outside `lib/demo/` should fire when `isDemoActive()`
returns true.** The same goes for writes: they should no-op silently
(throwing on write would break optimistic UI).

## The 16 scenarios

Each scenario is a single-question fixture: pick one widget question, build
the minimum override that exercises it. Don't clone the baseline.

Each entry in the registry carries metadata that drives the UI:

- `category` (one of `baseline`, `coverage`, `outcomes`, `coordination`,
  `pricing`, `deltas`, `memory`, `empty-states`): top-level grouping in
  the popover and table.
- `dimensions` (zero or more of `team-size`, `capture-depth`, `pricing`,
  `deltas`, `coordination`, `memory`, `live-presence`, `outcomes`): what
  this scenario varies vs the healthy baseline. Drives the dimension
  filter on the browse page.
- `views` (subset of `overview`, `reports`, `tools`, `project`, `global`):
  which routes' UI meaningfully changes. Drives the popover's scope
  filter.
- `summary`: one-line plain English, replaces the old widget-jargon
  description.
- `whatToCheck`: one sentence on what a dev should look for when the
  scenario is active.

| ID                       | Category     | What it asserts                                                                                                         |
| ------------------------ | ------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `healthy`                | baseline     | Full team, full coverage, positive delta. The reference dataset.                                                        |
| `empty`                  | empty-states | Zero sessions, no live agents, no Reports runs. Every empty state at once.                                              |
| `solo-cc`                | coverage     | One handle on Claude Code. No team coordination data; deep capture intact.                                              |
| `solo-no-hooks`          | coverage     | One handle on JetBrains. No tokens, no conversation, no tool calls. Every coverage note fires.                          |
| `mixed-capture`          | coverage     | Realistic team where some tools have hooks and some don't. Partial data-coverage tile and per-widget coverage notes.    |
| `stale-pricing`          | pricing      | LiteLLM snapshot >7 days old. Cost fields render `--` with the "pricing refresh pending" coverage note.                 |
| `models-without-pricing` | pricing      | Some observed models missing from LiteLLM. Coverage note names them.                                                    |
| `first-period`           | deltas       | No previous window. Every delta pill suppresses.                                                                        |
| `negative-delta`         | deltas       | Period got worse. Red downward arrows in stat cards.                                                                    |
| `no-live-agents`         | empty-states | Analytics intact, zero active agents. Live widgets show their empty state.                                              |
| `team-conflicts`         | coordination | Active collisions, retries, overlap. Drives the coordination story.                                                     |
| `failure-heavy`          | outcomes     | Outcome mix tilts hard toward abandoned/failed. Drives the Failures report story.                                       |
| `stuck-heavy`            | outcomes     | ~32% of sessions hit the 15-min stuck threshold. Lights up stuckness + retry-pattern widgets without changing outcomes. |
| `high-cost`              | outcomes     | Cost up, expensive model dominates. Cost stat delta turns red; by-model bar leans toward Opus.                          |
| `memory-stale`           | memory       | Aging skewed >90d, stale count high. Freshness warn.                                                                    |
| `memory-concentrated`    | memory       | Single-author directories dominate. Concentration warn.                                                                 |

### Known coverage gaps

The `views` array on each scenario is honest about which routes change.
Some scenarios that conceptually _should_ light up Reports (e.g.
`team-conflicts` for the Collisions report, `failure-heavy` for the
Failures report, `memory-stale` for the Memory Cleanup report) currently
default to `createBaselineReports()`. Fixing this means populating the
`reports` slice in those scenario builders so the Reports UI tells the
matching story. Not blocking on this refactor; flagged here so it doesn't
get lost.

## Adding a scenario (reusing existing fixture domains)

1. Pick the question. "What does X look like when Y?" Don't add a scenario
   without a specific widget or coverage state it lights up.
2. Add the id to the `DemoScenarioId` union in `scenarios.ts`.
3. Write a builder that calls `createBaselineAnalytics()` (or the relevant
   baseline) and overrides only the fields the question needs.
4. Default `reports`, `live`, `conversation` to the baseline unless the
   scenario meaningfully diverges (e.g. a no-hooks scenario should also
   return `createEmptyReports()` because the foundational reports need
   capture data the scenario claims doesn't exist).
5. Register the scenario in `DEMO_SCENARIOS` with the metadata the picker
   and browse page consume:
   - `category`: pick the most natural top-level bucket; if it's a tie,
     pick the one a dev would search first.
   - `dimensions`: the variables this scenario varies vs baseline. Empty
     for `healthy`. Multi-dimension scenarios (e.g. `empty`) should list
     every dimension that meaningfully changes.
   - `views`: every route whose UI you'd expect to look different from
     `healthy` under this scenario. Be honest. If you list `reports` but
     don't override the `reports` slice, you'll mislead the picker.
   - `summary`: one line, plain English, no widget jargon, no internal
     coverage-note phrases.
   - `whatToCheck`: one sentence on the visual change to look for.
6. The switcher and `/dashboard/demo` browse page pick it up automatically.

If the scenario needs a fixture domain that does not exist yet (e.g. a
brand-new product surface), follow the next section first, then come
back here.

## Adding a fixture domain (e.g. async management notifications)

When a new product surface needs demo data:

1. Add a `createBaseline<X>()` (and an empty variant if zero is a valid
   state) in a new file under `lib/demo/`.
2. Add the field to `DemoData` in `scenarios.ts` and update every scenario
   builder. Most call the baseline; only those whose story contradicts the
   data should call the empty variant.
3. Export the helpers from `index.ts`.
4. Add a `useDemo<X>()` hook in `packages/web/src/hooks/` that reads the
   scenario via `useDemoScenario()` and returns the field. When the real
   backend lands, that hook adds the conditional fetch.
5. Replace any direct fixture imports in the views with the hook.
6. Add a row to the centralization map above so future readers can see
   the new wiring without reading every consumer.

The rule: nothing in the dashboard should ever read mock data from a path
that isn't `lib/demo/`. If you find scattered fixtures, fold them in.
