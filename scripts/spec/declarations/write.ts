/**
 * Writes `spec/mods-declarations.json` from the pulled declarations (`bun run types:pull`): the
 * snapshot the mods tests compare the kit with (AGENTS.md, E2a; docs/SPEC.md, "Declarations").
 *
 *   bun run types:extract
 */
import { DECLARATIONS_FILE } from './snapshot.ts';
import { pulledDeclarations } from './extract.ts';

const declarations = await pulledDeclarations();
if (!declarations) throw new Error('no declarations are pulled: run `bun run types:pull`');
await Bun.write(DECLARATIONS_FILE, `${JSON.stringify(declarations, null, 2)}\n`);
const methods = Object.values(declarations.api).reduce(
  (sum, ns) => sum + Object.keys(ns).length,
  0,
);
console.log(
  `Claude Code ${declarations.claudeCode}: ${Object.keys(declarations.events).length} events, ` +
    `${methods} members of $, ${Object.keys(declarations.props).length} elements`,
);
