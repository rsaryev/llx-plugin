# Contributing

```sh
bun install          # also installs the git hooks
bun test             # every test, or one file: bun test tests/format/…
bun run check        # everything CI and the pre-push hook run
```

[AGENTS.md](AGENTS.md) is the operating guide, for people and coding agents alike. Read it first.

## What a change has to keep

- **Evidence, not memory.** A behaviour comes from the official docs, a shape from the official
  types. Pull the docs (`bun run docs:pull`), read the section you implement and cite it in the
  test's header. Another host's behaviour, a blog or an issue is a lead to check, never evidence.
- **A test per requirement.** Every behaviour is proven by a test under `spec(id)` for a requirement
  in `spec/requirements.json`. Write the failing test first ([docs/TESTING.md](docs/TESTING.md)).
- **A judgment where the docs are silent.** Say so in a comment and add a row to
  [spec/judgments.md](spec/judgments.md). A judgment never counts as compatibility.
- **Every effect is a port.** `src/` uses no `node:*`, `Bun`, `process`, `Date`, `fetch` or timer
  ([docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)).
- **Never copy a hole.** Where Claude Code's behaviour is unsafe, the kit is safe by default and
  [docs/SECURITY.md](docs/SECURITY.md) records the deviation.

## Figures in the documentation

No compatibility figure is typed by hand: each comes from
[docs/COMPATIBILITY.md](docs/COMPATIBILITY.md), which `bun run compat` writes.

## Releases

A `feat`, `fix` or `perf` commit adds its entry to [CHANGELOG.md](CHANGELOG.md) under
`[Unreleased]`; the commit hook checks it. A tag `v<version>` publishes that version
([release workflow](.github/workflows/release.yml)).
