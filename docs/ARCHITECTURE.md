# Architecture

## What the kit is

A library a host embeds to support Claude Code plugins: it reads the plugin format and runs the
parts that need a runtime (hooks, skill expansion, rule matching) through ports. It is not an
agent, not a model client and not a sandbox. It runs anywhere JavaScript runs.

## Layers

`src/` is split into modules; a module imports only from its own folder and from lower layers
(`bun run check:layers`, L1). `src/index.ts` is the public entry and may import anything.

| Layer | Module        | Holds                                                                         |
| ----- | ------------- | ----------------------------------------------------------------------------- |
| 0     | `protocol`    | Official types re-exported; runtime lists asserted equal to them              |
| 1     | `ports`       | The interfaces a host implements, type-only: files, runner, http, model, mcp… |
| 2     | `format`      | Pure readers and validators of plugin files: manifest, frontmatter            |
| 3     | `rules`       | Permission rule syntax: parse and match, tool names, path globs (planned)     |
| 3     | `settings`    | Settings layers and the policy keys, pure over data (planned)                 |
| 3     | `marketplace` | Marketplace and plugin-entry reading, sources, dependencies (planned)         |
| 3     | `loading`     | A plugin folder to a typed `Plugin`, variable substitution (planned)          |
| 4     | `agents`      | Sub-agent definitions and their scoping (planned)                             |
| 4     | `hooks`       | The hook engine: select, run through ports, merge outputs (planned)           |
| 4     | `skills`      | Skill and command expansion (planned)                                         |
| 4     | `mods`        | The mods runtime: events, guest hooks through a host runtime (planned)        |
| 5     | `host`        | `createPluginHost`, sessions: composition of the modules above (planned)      |
| 6     | `testing`     | Fakes of every port for hosts' tests (planned)                                |

Modules of the same layer never import each other (L1): what two of them share lives in a lower
layer. `tests/support/` holds the fakes of the ports until `testing` publishes them.

## Ports

`src/ports/` is one type-only file per port (`index.ts` is the barrel). Conventions every stream
follows:

- A port is minimal; a stream that needs more of one extends it in its own file, in its own module
  or as `src/ports/<stream>.ts`, and never edits a shared port without its owner.
- A request that does I/O carries `signal: AbortSignal` (runner, http, model, mcp); a path-style
  read takes it as a trailing optional argument (`PluginFiles`, `Locations`).
- An absent file or directory is `undefined`, not an error. An effect that did not happen is a
  `PortFailure` value (`{ failure, message }`) in the result union, never a throw; a missing port is
  a `PluginIssue` for the component that needed it.
- `CommandRunner` takes the form it should run (`exec` with arguments, or `shell` with a named
  shell), so the kit never builds a process line; timeouts are computed by the kit and enforced by
  the port.
- Paths a `PluginFiles` takes are relative to the plugin folder and `/`-separated; the host's own
  paths come from `Locations`, which also joins them.

## Invariants

- **L2** `@anthropic-ai/*` is imported only in `src/protocol/`, only as `import type`.
- **L3** `src/` imports no `node:*` or `bun` module and reads no `Bun` or `process` global. Every
  effect is a port call; the kit cannot tell a laptop from a cloud sandbox.
- **L4** `src/` never imports `tests/` or `scripts/`.
- An error in a plugin is a `PluginIssue`, never a thrown exception; a thrown exception is a bug
  in the kit.
- What Claude Code documents decides behaviour (docs/SPEC.md); anything else is a recorded
  judgment.

## Repository

| Folder          | Holds                                                                       |
| --------------- | --------------------------------------------------------------------------- |
| `src/`          | the package                                                                 |
| `tests/`        | tests mirroring `src/` modules; `tests/support/` helpers (`spec()`)         |
| `spec/`         | `requirements.json` (generated), `judgments.md`                             |
| `scripts/docs/` | `docs:pull`                                                                 |
| `scripts/spec/` | the requirement extractor and `check:spec`                                  |
| `scripts/compat/` | the compatibility report                                                  |
| `scripts/`      | the other gates (`check-*.ts`)                                              |
| `config/lint/`  | the quality lint (`quality.json`) and the kit's own rules (`kit-rules.js`)  |
| `.cache/`       | pulled docs, the corpus, test reports: local only                           |
