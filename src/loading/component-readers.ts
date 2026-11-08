import {
  readHooks,
  readLspServers,
  readMcpServers,
  readMonitorList,
  readSettings,
} from './readers-config.ts';
import { pathFiles, textFiles } from './readers-text.ts';
import type { ComponentReader, ReadKind } from './reader-types.ts';

/**
 * The integration seam of loading: one reader per component kind, typed over the kinds, so a kind
 * added to the layout fails the typecheck until it has one. Each reads what discovery found.
 *
 * `skills`, `commands`, `agents` and `outputStyles` keep the path, name and text of each file: the
 * streams that own those formats (skills, agents, content) replace the entry with a reader that
 * parses it, and nothing else in loading changes. `hooks`, `mcpServers`, `lspServers`, `monitors`
 * and `settings` read their JSON through the format readers; `workflows` and `themes` keep paths;
 * `bin` hands over the listing.
 */
export const COMPONENT_READERS: { readonly [K in ReadKind]: ComponentReader<K> } = {
  skills: textFiles('skills', (context) => context.discovered.skills),
  commands: textFiles('commands', (context) => context.discovered.commands),
  agents: textFiles('agents', (context) => context.discovered.agents),
  outputStyles: textFiles('outputStyles', (context) => context.discovered.outputStyles),
  workflows: pathFiles((context) => context.discovered.workflows),
  themes: pathFiles((context) => context.discovered.themes),
  hooks: readHooks,
  mcpServers: readMcpServers,
  lspServers: readLspServers,
  monitors: readMonitorList,
  settings: readSettings,
  bin: (context) => Promise.resolve({ value: context.discovered.bin, issues: [] }),
};
