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
read only by `scripts/`, never by `bun test`.

## What a good spec test looks like

- One `spec(...)` block per requirement (or a small set the same behaviour proves together).
- A positive case and the documented failure: a field of the wrong type fails, a path with `..`
  is refused with the validator's message.
- Messages the docs quote verbatim are asserted verbatim.
- No assertion on behaviour the docs do not state; a judgment is tested outside `spec(...)`.

## Commands

| Task                           | Command                                |
| ------------------------------ | -------------------------------------- |
| Every test                     | `bun test`                             |
| One file                       | `bun test tests/format/manifest-fields.test.ts` |
| Tests and the report           | `bun run compat`                       |
| Everything CI and pre-push run | `bun run check`                        |
