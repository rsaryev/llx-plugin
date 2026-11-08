# Spec and evidence

The kit claims compatibility with Claude Code only where a passing test proves it against
Anthropic's own published material. This doc is the process; `docs/COMPATIBILITY.md` is its
output.

## Sources of truth

| Source                                           | What it decides                                     | Where it lives                       |
| ------------------------------------------------ | --------------------------------------------------- | ------------------------------------ |
| Claude Code docs (code.claude.com)               | behaviour: fields, events, rules, defaults, errors  | `.cache/claude-docs/` (gitignored)   |
| `@anthropic-ai/claude-agent-sdk` type declarations | shapes: hook inputs/outputs, tools, agents, MCP, settings | `node_modules/` (pinned)       |
| Real plugins (official and community marketplaces) | what plugins actually use (the corpus)            | `.cache/corpus/` (gitignored)        |
| The oracle: `claude plugin validate --json` of the same release | message wording, and the checks only the validator makes, where the docs are silent | `.cache/corpus/oracle/<release>/` (gitignored) |

Nothing else is evidence: not memory, not another host's behaviour (Localix included), not a
plausible guess. Where the docs are silent, the kit makes a **judgment**, recorded with its reason
in the code comment next to it and listed in `spec/judgments.md`; a judgment never counts toward
compatibility.

**The oracle** is the official CLI of the release the kit tracks (`requirements.claudeCode`),
observed as a black box: run on an input, its output read, the program itself never opened, unpacked
or decompiled. What it prints decides the wording of a validator message and which checks the
validator makes beyond what the docs describe. Where the docs speak, they win: a doc requirement is
proved by a `spec(id)` test on what the docs say, and the oracle's longer wording is asserted
beside it, outside `spec(...)`, unless a requirement id is exactly that behaviour. Each behaviour
taken from the oracle is a row in `spec/judgments.md` marked `oracle 2.1.319` (the release), with an
input that shows it written by hand (never a third party's file copied); moving to a new release
means re-running the corpus and re-checking those rows.

## Requirements

`bun run docs:pull` downloads the docs (`scripts/docs/pull.ts`). `bun run spec:extract` reads
them with the rules in `scripts/spec/sources.ts` and writes `spec/requirements.json`: one entry
per documented event, field, source, tool, rule example or element, with its category, page and
section. It stores identifiers only, never the docs' text.

- Each rule names a page, a section (a heading pattern) and optionally a table header. Every rule
  must find something, so a page Anthropic restructures stops the extraction loudly.
- A cell listing several code spans (`` `min` / `max` ``) yields one requirement each.
- The output is sorted and stable; the extractor prints what was added and removed.
- The extractor also writes `spec/docs-tables.json`, the tables of the mods reference the mods
  tests compare the kit with (events, API methods, limits, elements, render sites, settings). Tests
  read this committed snapshot and never `.cache/claude-docs`; `check:spec` (SP5) compares it, and
  `tests/support/tool-table.ts` (the tools table), with the pulled pages whenever they are present.

A requirement id reads `<category path>.<key>`: `manifest.field.homepage`,
`hooks.handler.common.timeout`, `hooks.input.PreToolUse.tool_input`, `permissions.rule.Bash(git push *)`.

## Proof

A test proves requirements by running under `spec(ids, body)` from `tests/support/spec.ts`, a
`describe` named `⟦id⟧`. `spec` refuses an id that is not in `spec/requirements.json`, and so does
`check:spec` (SP2) statically. A test states the behaviour the cited section documents, with the
section named in the file's header comment.

`bun run compat` runs every test with a JUnit report and writes `docs/COMPATIBILITY.md`:

- a requirement is **proven** when at least one test under its block ran and all of them passed;
- **failing** when one of them failed; **unproven** when none ran;
- the share proven, overall and per category, over every requirement. Nothing is excluded from
  the denominator, so the number never flatters.

`bun run check` ends with `compat --check`: a failing test or a stale report fails the check.

## Official types

`src/protocol/official.ts` re-exports Claude Code's types from the SDK with `import type` (L2:
nowhere else, never at runtime). Runtime lists the kit needs (`HOOK_EVENTS`,
`HOOK_HANDLER_TYPES`) are `as const` arrays asserted equal to the official unions with
`Assert<Equal<…>>`; registries are mapped types over those unions. When the SDK adds, removes or
renames an event, a handler type or a field, `bun run typecheck` names every place to change.

## Updating to a new Claude Code release

The SDK's version tracks Claude Code's (`0.3.N` ↔ `2.1.N`); `check:spec` (SP3) refuses a pair
that disagrees, and SP4 refuses pulled docs newer than the requirements, and SP5 a snapshot the pulled docs contradict.

1. `bun run docs:pull` and `bun add -d @anthropic-ai/claude-agent-sdk@<matching>` (keep the
   `peerDependencies` range in step).
2. `bun run spec:extract`: read the added and removed requirements.
3. `bun run typecheck`: fix every place a changed official type breaks.
4. Write tests for the added requirements, fix what fails, `bun run compat`.
5. Commit the requirements, the code and the report together.
