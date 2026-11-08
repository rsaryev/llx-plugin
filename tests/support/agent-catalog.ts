/** Catalog agents of every source, built through the readers, for the tests of `src/agents/catalog`. */
import type { ScannedAgent } from '../../src/agents/catalog/scan.ts';
import { catalogAgentOf, type CatalogAgent } from '../../src/agents/catalog/types.ts';
import { readAgent } from '../../src/format/agent.ts';
import { readFlagAgents } from '../../src/format/agent-flag.ts';
import { loaded } from './agent-files.ts';

type FileSource = ScannedAgent['source'];

const text = (name: string, extra: string): string =>
  `---\nname: ${name}\ndescription: ${name} from the tests\n${extra}---\nYou are ${name}.\n`;

/** An agent read from `path` as `source` reads it. `extra` adds frontmatter lines. */
export function fileAgent(
  source: FileSource,
  name: string,
  options: { readonly path?: string; readonly extra?: string } = {},
): CatalogAgent {
  const path = options.path ?? `/${source}/.claude/agents/${name}.md`;
  return catalogAgentOf(loaded(readAgent(text(name, options.extra ?? ''), { source, path })));
}

/** The same agent as a scan result: `order` is its place among the folders of its source. */
export function scannedAgent(
  source: FileSource,
  name: string,
  options: { readonly order?: number; readonly path?: string; readonly extra?: string } = {},
): ScannedAgent {
  return {
    agent: fileAgent(source, name, options),
    source,
    origin: 'projectAgents',
    base: `/${source}`,
    order: options.order ?? 0,
  };
}

export function flagAgent(name: string, extra: Record<string, unknown> = {}): CatalogAgent {
  const { agents } = readFlagAgents({
    [name]: { description: `${name} from the flag`, prompt: '', ...extra },
  });
  const [record] = agents;
  if (record === undefined) throw new Error(`the flag agent ${name} did not load`);
  return catalogAgentOf(record);
}

/** A plugin agent `<plugin>:<folders>:<name>` read as a plugin's `agents/` folder is. */
export function pluginAgent(
  plugin: string,
  name: string,
  relativePath = `${name}.md`,
): CatalogAgent {
  return catalogAgentOf(
    loaded(
      readAgent(text(name, ''), {
        source: 'plugin',
        path: `/plugins/${plugin}/agents/${relativePath}`,
        plugin: { name: plugin, relativePath },
      }),
    ),
  );
}
