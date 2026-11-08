# Architecture

## What the kit is

A library a host embeds to support Claude Code plugins: it reads the plugin format and runs the
parts that need a runtime (hooks, skill expansion, rule matching) through ports. It is not an
agent, not a model client and not a sandbox. It runs anywhere JavaScript runs.

## Layers

`src/` is split into modules; a module imports only from its own folder and from lower layers
(`bun run check:layers`, L1). `src/index.ts` is the public entry and may import anything.

| Layer | Module     | Holds                                                                    |
| ----- | ---------- | ------------------------------------------------------------------------ |
| 0     | `protocol` | Official types re-exported; runtime lists asserted equal to them         |
| 1     | `ports`    | The interfaces a host implements (planned)                               |
| 2     | `format`   | Pure readers and validators of plugin files: manifest, components        |
| 3     | `rules`    | Permission rule syntax: parse and match (planned)                        |
| 4     | `hooks`    | The hook engine: select, run through ports, merge outputs (planned)      |
| 4     | `skills`   | Skill and command expansion (planned)                                    |
| 5     | `host`     | `createPluginHost`, sessions: composition of the modules above (planned) |
| 6     | `testing`  | Fakes of every port for hosts' tests (planned)                           |

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
