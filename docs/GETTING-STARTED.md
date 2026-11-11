# Getting started

Installing the kit, type-checking against it, and wiring a host's ports. The API is in
[`docs/API.md`](API.md); every export has a row under [`docs/api/`](api/root.md).

## Install

```sh
bun add @rsaryev/llx-plugin
bun add -d @anthropic-ai/claude-agent-sdk @modelcontextprotocol/sdk --omit=optional
```

The kit runs on Bun, which reads its `src`, and on Node.js 22 or later, which reads its `dist`
(`engines`).

The two SDK peers supply official types, including MCP tools and prompts. The kit never loads
their runtimes or the Claude Code binary the Agent SDK ships as an optional dependency, so install
them without optional dependencies. `--omit=optional` holds for that one command only: a later
`bun install` (a clean clone, CI) installs the binary of the platform again, and omitting optional
dependencies for every install drops those of your other packages too. Keep these peers available
wherever the kit's declarations are type-checked: without them `skipLibCheck: true` turns every
type the kit takes from the SDKs into `any` without an error. A host does not need to start Claude
Code or an MCP client to import the kit.
For Node TypeScript projects, supply the runtime's `@types/node` and a library set including
`esnext.disposable`, which the official Agent SDK declarations use.

Both peers are optional (`peerDependenciesMeta`): a package manager does not install them for you.
Type-check with `skipLibCheck: true`: the Agent SDK's own declarations do not compile against the
zod the kit pins (`ZodPreprocess` arity errors in `sdk.d.ts`), which is the SDK's to fix.

### Type-check against the source

A host that links the kit by path (a workspace, `file:`) and type-checks its `src` rather than a
build adds the package's own condition, which every subpath maps to its `src/**/*.ts` entry. A host
that installs the kit from the registry reads its declarations instead and needs no condition; with
the condition it would also compile the kit's source, which needs `@types/semver`:

```jsonc
// tsconfig.json of the host
{
  "compilerOptions": {
    "moduleResolution": "bundler",
    "customConditions": ["llx-plugin-source"],
    "allowImportingTsExtensions": true,
    // The kit's source is checked with your options: it compiles under these.
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
  },
}
```

Bun and Node ignore the condition. Without it, TypeScript reads the built `dist/**/*.d.ts`, so a
linked checkout needs `bun run build` first.

## Use

```ts
import { createPluginHost, loadPlugin } from '@rsaryev/llx-plugin';

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

`validatePlugin({ files })` reports what `claude plugin validate` reports for a folder, in its words.

Wiring the ports:

- `Locations.pluginRoot(id)` must return the folder `loadPlugin` read for that plugin: it is
  `${CLAUDE_PLUGIN_ROOT}` and where its command hooks run. With the testing kit's `locations()`,
  list each plugin root (and the project) in `directories`, or every command hook fails with "Plugin
  directory does not exist".
- The ports of `createPluginHost` are fixed for the host's life; `host.update` replaces plugins and
  settings, not ports. Bind what changes per run in `SessionOptions.ports` or a turn's
  `withTurn({ ports })` (the models, the MCP caller, the observer, the scratch files, the
  runner a skill's `!` commands and the hooks use), or give the host a port that forwards to the
  one bound later:

  ```ts
  let models: ModelRunner | undefined; // set when the provider is ready
  const bound = (): ModelRunner => {
    if (models === undefined) throw new Error('no model runner yet');
    return models;
  };
  const lateModels: ModelRunner = {
    evaluate: (request) => bound().evaluate(request),
    runAgent: (request) => bound().runAgent(request),
  };
  ```

- A folder that may not be a plugin: `classifyPluginFolder` says `plugin` or `folder-of-plugins`;
  for a folder of plugins `readPluginDirectory` lists the subfolders that load, so an empty list
  is a folder to refuse.

The root holds what a host loop calls; each domain has its whole surface at a subpath:
`./marketplace` (`readMarketplace`, `planMarketplaceFetch`, `planPluginFetch`: marketplaces,
installs and updates over your fetch ports), `./mods` (`createModsHost`: mods and their hook chain,
with `./mods/elements` and `./mods/isolate` for a UI process or an isolate), `./cli` (`planInstall`
and the rest of `claude plugin`), `./sdk` (a session's hooks as the Agent SDK's `hooks` option),
and `./loading`, `./format`, `./skills`, `./hooks`, `./rules`, `./settings`, `./agents`,
`./layout`, `./elicitation` for the parts.

[`examples/ai-sdk-agent`](../examples/ai-sdk-agent/README.md) is a small agent on the AI SDK that runs
real plugins through the kit (hooks of every handler type, skills, commands, subagents, MCP servers).
`bun run smoke` there runs one turn on a scripted model, with no key and no network, and the
repository's `bun run check` runs it; `bun run scenarios` checks real plugins on Claude Haiku 5.5.

Test your integration without a disk, a shell or a network with the fakes of
`@rsaryev/llx-plugin/testing`. The full API is in [`docs/API.md`](API.md), and every export
of every entry has a row in its table under [`docs/api/`](api/root.md).
