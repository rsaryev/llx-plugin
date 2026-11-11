# Plugin-host scope audit

The owner selected **100% of the plugin-host contract**, not a reimplementation of the Claude Code
application, on 2026-11-08. This is a scope decision, not evidence that any remaining behavior works.
Passing tests alone determine compatibility. An unimplemented plugin rule stays in the denominator.

## Boundary

The kit reads, validates, discovers, installs, updates, configures and executes plugin components.
It owns hook dispatch, permission matching, skill expansion, component catalogs, plugin policy,
MCP/LSP configuration and naming, monitor triggers, channel messages and the mods extension API.
The mods UI protocol is a plugin interface and is **in scope**; native menus are not.

The host supplies its model, agent scheduler, MCP/LSP transport clients, native UI and storage ports.
Those effects must not be replaced with tautological tests or hardcoded descriptions of Claude Code.
Official SDK shapes stay in `src/protocol/official.ts`; SDK client methods are not this library's API.

## Whole pages classified outside the contract

Each page below remains in `spec/out-of-scope-pages.json`, with the existing documented reason.

| Page | Reason | What remains covered elsewhere |
| --- | --- | --- |
| `claude-directory.md` | engine | Plugin paths and persistent plugin data in the manifest, components and loading references |
| `memory.md` | engine | Customization-source policy; hook inputs that report memory files |
| `large-codebases.md` | engine | Skill discovery, permission paths and code-intelligence plugin configuration |
| `statusline.md` | product | Validation and managed repair of settings that contain executable commands |
| `worktrees.md` | engine | Agent `isolation`, `WorktreeCreate` and `WorktreeRemove` hook contracts |
| `headless.md` | engine | Plugin session flags and interactive/non-interactive guards in their own references |
| `plugin-evals.md` | engine | Plugin validation remains in scope; the native eval/model/grader runner does not |
| `model-config.md` | engine | Agent/skill model fields, model-name validation and applicable managed allowlists |
| `commands.md` | product | Plugin command loading, invocation and MCP prompt naming |
| `agent-teams.md` | engine | Agent definitions and hook/mod events for teammates, without a tmux/team scheduler |
| `goal.md` | engine | `GoalEvaluate` hook inputs and outputs, without the native `/goal` loop |
| `scheduled-tasks.md` | engine | Invocable skills and mod timers, without the native cron/`/loop` scheduler |
| `auto-mode-config.md` | engine | Permission settings, validation, mode selection and hook-rewrite safety; not the model classifier |
| `agent-sdk/plugins.md` | sdk-api | Plugin discovery and live host updates |
| `agent-sdk/hooks.md` | sdk-api | Official hook shapes and command/HTTP/MCP/model hook dispatch |
| `agent-sdk/skills.md` | sdk-api | Filesystem skills, visibility, expansion and invocation |
| `agent-sdk/subagents.md` | sdk-api | Agent catalogs, definitions, selection and restrictions |
| `agent-sdk/permissions.md` | sdk-api | Permission rules and mode semantics, not the SDK client's `canUseTool` lifecycle |
| `agent-sdk/mcp.md` | sdk-api | Plugin MCP descriptors, schema checks, naming, policies and startup plans |
| `agent-sdk/claude-code-features.md` | sdk-api | Component source policy and settings merging; not SDK session bootstrapping |

## Partial pages

The `scripts/spec/scope-*.ts` entries name excluded headings explicitly. New headings default to
inclusion and a stale skip fails extraction.

- `tools-reference.md`: retain tool names and input shapes, agent tool selection, permission-rule
  integration, Bash/PowerShell deny interaction and hook/skill shell selection. Native tool I/O,
  command backgrounding, memory limits, file editing and browser/tool implementations are host work.
- `sub-agents.md`: retain definitions, scopes, validation, tools, MCP trust, skills, hooks, selection
  and spawn restrictions. Native conversation forks, memory persistence, retries, compaction,
  session resumption and output scanning belong to the scheduler/model host.
- `plugins/mods/api.md`: retain request shaping and all API methods. Diagnosing gateway/model cache
  misses is model infrastructure, not a mods protocol implementation.
- `plugins/cli-reference.md`: retain install/configuration/dependency/update/validation contracts.
  Native `init`, `test` and eval authoring/runners are tooling, not loading or executing a plugin.
- `plugins/host-marketplace.md`: organization-side sync is a hosted service. The company-rollout
  role checklist is advice; source fetching, authentication, installs and policy remain in scope.
- `plugins/org.md`: cloud organization filtering is a service; application-specific rollout UI
  timing is UI. Source restrictions, required plugins and update controls stay in scope.
- `server-managed-settings.md`: retain delivered-policy validation, composition, approval gating
  and fail-closed decisions. Account-bound polling, approval persistence and login routing are
  supplied by the delivery host, not implemented by the kit.
- `output-styles.md`: retain file format, loading and selection semantics; native application menus
  are UI.
- `errors.md`: retain relevant plugin diagnostics. Eval access, native memory loading and the MCP
  client's connection-retry cache are not plugin-host error contracts.
- `hooks.md`: "Get terminal notifications inside tmux or GNU screen" configures the user's tmux or
  screen, not the hook output; `terminalSequence` itself stays in scope.
- `settings-reference.md`: of "What else `denyInsteadOfPrompting` stops", the classifier billing
  notice is Claude Code's own dialog for its model classifier (`auto-mode-classifier-billing.md` is
  out of scope); the question and plan tools, MCP elicitation and permission hosts stay in scope.
  A single list item is excluded with a `skipItems` entry.

## Mixed tables

`scripts/spec/row-scope.ts` identifies foreign environment/flag rows by their documented meaning,
not by whether a passing test exists. The broad plugin/topic filters still include unknown names
matching plugin interfaces. Global switches that affect plugin execution are explicitly included.

`spec/out-of-scope.json` records table-row exclusions as `section — row` as well as excluded
headings. When several table rules read one table, a row is excluded only if **none** admits it.
The audit cannot claim a plugin setting is excluded merely because another topic's rule omitted it.

No source in the audit reads the compatibility report or the JUnit proof ledger.
