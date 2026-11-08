# Testing

## Test first

Every behaviour starts as a failing test that cites the section of the docs it comes from, under
`spec(id)` for the requirement it proves (docs/SPEC.md). Then the code, then `bun run compat`.

## Where tests live

`tests/<module>/` mirrors `src/<module>/`; helpers live in `tests/support/` (T2). A test file is
`*.test.ts`. No test is focused or switched off (T1); a test that needs something a machine may
lack uses `skipIf(!available)`.

## Deterministic

Tests touch no network, no real clock, no randomness and no files outside a temporary folder they
make. The kit's ports make this natural: a test passes fakes. The pulled docs and the corpus are
read only by `scripts/`, never by `bun test`: a table a test needs from the docs is committed
(`spec/docs-tables.json`, `tests/support/tool-table.ts`) and `check:spec` (SP5) compares it with
the pulled docs.

## Fakes of the ports

`src/testing/ports` holds an in-memory fake of every port (docs/API.md, "Testing kit"), published as
`@rsaryev/claude-plugin-kit/testing`; `tests/support/ports.ts` re-exports it, one copy:
`memoryFiles(record)`, `scriptedRunner(...replies)`, `recordingHttp(...replies)`,
`fakeModel(...replies)`, `fakeMcp(options)`, `fixedClock(start)`, `locations(options)`,
`fakeEnvironment(record)` and `memoryScratch()`. The scripted ones answer in order, record every
call and throw when the script is spent, so a test never passes by accident. A stream tests
through these and extends them in a file of its own, never by editing another stream's.

## What a good spec test looks like

- One `spec(...)` block per requirement (or a small set the same behaviour proves together).
- A positive case and the documented failure: a field of the wrong type fails, a path with `..`
  is refused with the validator's message.
- Messages the docs quote verbatim are asserted verbatim.
- No assertion on behaviour the docs do not state; a judgment is tested outside `spec(...)`.

## Corpus

The spec proves the kit against the docs; the corpus checks it against real plugins and the real
validator. `bun run corpus:fetch` clones the official and community marketplaces into
`.cache/corpus/`, reads them with the kit's own `readMarketplace`, and runs each entry's
`planPluginFetch` as a host would (a shallow git clone pinned to the entry's `sha` or `ref`, sparse
for a subdirectory). `bun run corpus` runs the kit over every fetched plugin and compares it with
the oracle, `claude plugin validate --json` of the same Claude Code release (SP3), run as a program
and never read (`scripts/corpus/oracle.ts`, cached per release). It prints the verdict agreement
(an error exactly when the oracle reports one), the share of the oracle's findings the kit reports
with the same severity and message, and the most frequent differences; `.cache/corpus/report.json`
holds every plugin's. Nothing of the corpus is committed, and `bun test` never reads it.

## Commands

| Task                           | Command                                |
| ------------------------------ | -------------------------------------- |
| Every test                     | `bun test`                             |
| One file                       | `bun test tests/format/manifest-fields.test.ts` |
| Tests and the report           | `bun run compat`                       |
| Everything CI and pre-push run | `bun run check`                        |
| Real plugins against the oracle | `bun run corpus:fetch`, then `bun run corpus` |
