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
and never read (`scripts/corpus/oracle.ts`, cached per release). The kit's side of the comparison is
`validatePlugin` over the plugin's folder (docs/API.md, "Validating"); `loadPlugin`'s own verdict
is printed on a separate line, because loading and validating differ on purpose (the validator
reports advice and checks the loader never makes). The run prints:

- the verdict agreement: an error exactly when the oracle reports one;
- the share of the oracle's findings the kit reports with the same severity and message, and the
  share also at the same file and path (findings are paired as a multiset, a finding at the right
  place first);
- the most frequent findings the kit misses, reports beyond the oracle, or puts elsewhere.

`.cache/corpus/report.json` holds every plugin's. Nothing of the corpus is committed, and `bun test`
never reads it. Tests of what the oracle showed are written with inputs of their own, outside
`spec(...)` (docs/SPEC.md, "Sources of truth").

Where the kit and the oracle still differ, and why: a plugin whose directory does not exist is
reported with the oracle's absolute path; `directory`-profile findings of the validator (checks
that need a network or the marketplace directory service) are out of scope; the oracle reads YAML
with Bun's parser, which has quirks the kit approximates (`tests/format/frontmatter-retry.test.ts`
lists what was observed); and a `.mcp.json` entry with a `url` and no `type` is an error to the
loader, as mcp.md says, while the validator reports nothing for that file.

## Commands

| Task                           | Command                                |
| ------------------------------ | -------------------------------------- |
| Every test                     | `bun test`                             |
| One file                       | `bun test tests/format/manifest-fields.test.ts` |
| Tests and the report           | `bun run compat`                       |
| Everything CI and pre-push run | `bun run check`                        |
| Real plugins against the oracle | `bun run corpus:fetch`, then `bun run corpus` |

## Benchmark

`bun run bench` times what a host repeats, over the real plugins of the corpus (`bun run
corpus:fetch` first), with effects stubbed so the numbers are the kit's own cost:

- `loadPlugin` per plugin, from disk (the corpus disk adapter) and from memory (kit CPU only);
- `createPluginHost`, `openSession`, `session.skills()` and `dispatch('PreToolUse')` for 20 plugins
  and for every loaded plugin at once (a stress case no host meets).

It prints a table and writes `.cache/bench.json`. Timings depend on the machine, so they are not a
gate; compare runs on one machine before and after a change that touches loading, the host or hooks.

## Mutation testing

`bun run mutation <module>` mutates `src/<module>` with StrykerJS and runs only `tests/<module>`
against each mutant (command runner, `bun test --bail`). A surviving mutant is a change of behaviour
the module's own tests do not notice: a weak or missing assertion. The report goes to
`.cache/mutation/<module>.json`; the score is printed. It is heavy (minutes to an hour per module),
so it runs by hand, never in hooks or CI. Run it on a module after changing its tests or code, and
kill survivors by asserting the documented behaviour they change, never by testing the mutation.

## Loading oracle

`bun run corpus:load` compares what the kit LOADS with what Claude Code loads, plugin by plugin:
whether the plugin loads, and the names of its skills (commands included, as multisets), agents,
hook events, MCP servers and LSP servers. Claude Code's side comes from
`claude --plugin-dir <dir> plugin details <name>`, run as a black box in a private config folder
(`.cache/corpus/oracle-load/home`): the command is offline, reads no person's settings and calls no
model. Results are cached per Claude Code version in `.cache/corpus/oracle-load/<version>/`; every
difference is written to `.cache/corpus/load-report.json`. `validatePlugin` agreeing with
`claude plugin validate` says nothing about loading; this does.

What the comparison reads: the kit's side is `loadPlugin` itself (`scripts/corpus/load-kit.ts`), not
a session, because `plugin details` lists what a plugin declares: a skill by the name it has inside
its plugin, the servers a file names before their entries are read, the hook events whose value is a
list. A `--plugin-dir` folder is classified first (`classifyPluginFolder`); a folder of plugins
answers for its child with the plugin's name.

What stays different, and why (spec/judgments.md, the last row): `plugin details` lists only the
top-level `.md` files of a `commands/` or `agents/` folder, never nested ones, never a manifest
path to a file or a `commands` object map (its debug log reports `ENOTDIR`); the docs say the
opposite (plugins/components.md, "Commands" and "Agents"), and the kit keeps the docs until a
session shows otherwise. `bun run corpus:load` prints the agreement per field; that residual is
all of the remaining `skills` and `agents` differences.
