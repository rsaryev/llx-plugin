# claude-plugin-kit

Add Claude Code plugin support to any agent. The kit reads plugins and runs their skills,
commands, agents and hooks through ports your host implements, so the same plugin works on a
laptop, in a container or in a cloud sandbox.

Private for now; published to GitHub Packages as `@rsaryev/claude-plugin-kit`.

## Why trust it

Compatibility is measured, not claimed. The official docs are turned into a list of requirements,
tests prove them, and [`docs/COMPATIBILITY.md`](docs/COMPATIBILITY.md) reports the share proven,
overall and per category. Claude Code's shapes are the official types of
`@anthropic-ai/claude-agent-sdk`, so a new release that changes one fails the build.

## Install

```sh
# ~/.npmrc: @rsaryev:registry=https://npm.pkg.github.com
bun add @rsaryev/claude-plugin-kit
bun add -d @anthropic-ai/claude-agent-sdk --omit=optional   # types only
```

The kit uses the Agent SDK for types alone; its runtime and the Claude Code binary it ships as
an optional dependency are never loaded, so install it without optional dependencies.

## Use

```ts
import { createPluginHost, loadPlugin } from '@rsaryev/claude-plugin-kit';

// Load a plugin once; `files` is your `PluginFiles` port (a folder, an archive, a sandbox).
const { plugin } = await loadPlugin({ files });
if (!plugin) throw new Error('the plugin does not load');

// `ports` are yours: how a command runs, where plugins live, what the environment holds.
const host = createPluginHost({
  plugins: [{ id: 'formatter@acme-tools', plugin }],
  ports: { commands, locations, environment, http },
});

const session = host.openSession({ sessionId, cwd, permissionMode: 'default', transcriptPath });

const { model, menu } = session.skills(); // list to the model and in `/` menus
const skill = await session.expandSkill('formatter:review', { arguments: 'src/', signal });
const outcome = await session.dispatch('PreToolUse', facts, { signal }); // hooks, typed per event
if (!outcome.proceed) console.log(outcome.block?.reason);
```

Test your integration without a disk, a shell or a network with the fakes of
`@rsaryev/claude-plugin-kit/testing`. The full API is in [`docs/API.md`](docs/API.md).

## Develop

See [`AGENTS.md`](AGENTS.md).
