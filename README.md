<p align="center">
  <img src="https://raw.githubusercontent.com/rsaryev/llx-plugin/main/docs/assets/logo.svg" width="72" height="72" alt="llx-plugin">
</p>

<h1 align="center">llx-plugin</h1>

<p align="center">
  <strong>Claude Code plugin support for any agent</strong><br>
  Skills, commands, agents, hooks, MCP, mods and marketplaces · through ports your host implements ·
  2,730 documented requirements, each proven by a test
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@rsaryev/llx-plugin"><img alt="npm" src="https://img.shields.io/npm/v/@rsaryev/llx-plugin?color=cb3837"></a>
  <a href="https://github.com/rsaryev/llx-plugin/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/rsaryev/llx-plugin/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="MIT licence" src="https://img.shields.io/badge/licence-MIT-blue"></a>
</p>

<p align="center">
  <a href="docs/GETTING-STARTED.md">Get started</a> ·
  <a href="docs/API.md">API</a> ·
  <a href="docs/COMPATIBILITY.md">Compatibility</a> ·
  <a href="docs/SECURITY.md">Security</a> ·
  <a href="examples/ai-sdk-agent/README.md">Example agent</a>
</p>

A library that reads Claude Code plugins and runs what they hold in your own agent: on a laptop, in
a container or in a cloud sandbox. It touches no disk, shell or network itself. Every effect is a
port your host implements, so the same plugin works wherever your agent runs.

```sh
bun add @rsaryev/llx-plugin
```

```ts
import { createPluginHost, loadPlugin } from '@rsaryev/llx-plugin';

// `files` is your port to the plugin's folder: a directory, an archive, a sandbox.
const { plugin } = await loadPlugin({ files });
if (!plugin) throw new Error('the plugin does not load');

// `ports` are yours: how a command runs, where plugins live, what the environment holds.
const host = createPluginHost({
  plugins: [{ id: 'formatter@acme-tools', plugin }],
  ports: { commands, locations, environment, http },
});
const session = host.openSession({ sessionId, cwd, permissionMode: 'default', transcriptPath });

const { model, menu } = session.skills(); // what the model sees, and the `/` menu
const skill = await session.expandSkill('formatter:review', { arguments: 'src/', signal });
const outcome = await session.dispatch('PreToolUse', facts, { signal }); // hooks, typed per event
if (!outcome.proceed) console.log(outcome.block?.reason);
```

Installing the type peers, type-checking and wiring the ports are in
[Getting started](docs/GETTING-STARTED.md).

## Why

- **Measured, not claimed.** The official docs are turned into 2,730 requirements, and a test proves
  each one: 100.0% for Claude Code 2.1.321, overall and per category
  ([compatibility](docs/COMPATIBILITY.md)). Where the docs are silent the kit records a judgment,
  and a judgment never counts.
- **Official shapes.** Hook inputs and outputs, tools, agents, MCP and settings are the types of
  `@anthropic-ai/claude-agent-sdk`, so a release that changes one fails the build.
- **Checked on real plugins.** `bun run corpus` compares the kit's `validatePlugin` with
  `claude plugin validate` of the same release on every plugin of the official and community
  marketplaces: the verdict and every finding ([testing](docs/TESTING.md)).
- **Host-agnostic.** The source uses no `node:*`, `Bun`, `process`, `fetch` or timer. It runs on Bun
  and Node.js 22 or later, and its ports have fakes in `@rsaryev/llx-plugin/testing`, so you test an
  integration without a disk, a shell or a network.
- **Safe by default.** Where Claude Code's behaviour is a hole, the kit is stricter, says so, and
  gives an option back where one exists ([security](docs/SECURITY.md)).

## What it covers

| Area               | What the kit does                                                                |
| ------------------ | -------------------------------------------------------------------------------- |
| Plugins            | reads the manifest and layout, validates in `claude plugin validate`'s words     |
| Skills, commands   | lists them to the model and the `/` menu, expands arguments, `!` commands, files |
| Agents             | subagent definitions, tool lists, model routing, frontmatter hooks               |
| Hooks              | every event and handler type, matched, run through your ports, merged            |
| MCP, LSP, monitors | servers a plugin declares, with expansion, policy and trust gates                |
| Settings, policy   | the settings layers, managed policy, permission rules, folder trust              |
| Marketplaces       | catalogs, installs, updates and dependencies over your fetch ports               |
| Mods               | the mod surface and its hook chain, for a UI process or an isolate               |

Each domain has its surface at a subpath: `./loading`, `./format`, `./skills`, `./hooks`,
`./rules`, `./settings`, `./agents`, `./marketplace`, `./mods`, `./cli`, `./sdk`, `./elicitation`,
`./layout` and `./testing`. Every export has a row under [`docs/api/`](docs/api/root.md).

[`examples/ai-sdk-agent`](examples/ai-sdk-agent/README.md) is a small agent on the AI SDK that runs
real plugins through the kit: hooks of every handler type, skills, commands, subagents and MCP
servers.

## Development

| Path        | What it holds                                                     |
| ----------- | ----------------------------------------------------------------- |
| `src/`      | the library, in layers ([architecture](docs/ARCHITECTURE.md))     |
| `tests/`    | one folder per module; a `spec(id)` test proves a requirement     |
| `spec/`     | the requirements extracted from the docs, and the kit's judgments |
| `docs/`     | the API, the process, and the generated compatibility report      |
| `examples/` | an agent on the AI SDK that the check runs                        |

```sh
bun install
bun test            # every test
bun run compat      # the tests and the compatibility report
bun run check       # everything CI runs: format, lint, layers, spec, docs, types, tests
bun run build       # dist, as published
```

CI checks every push to `main` and every pull request. A tag `v<version>` publishes that version to
npm ([release workflow](.github/workflows/release.yml)). How to work on it, and what a change has
to keep: [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md).

An independent project: not affiliated with, endorsed by or supported by Anthropic. Claude and
Claude Code are trademarks of Anthropic, PBC.
