/**
 * `@rsaryev/llx-plugin/mods/isolate`: what code running inside an isolate needs of mods, with no
 * `node:` or `bun` import anywhere below it (`tests/entry/mod-isolate.test.ts` walks the graph): the
 * `$.state` helpers a module imports from `claude-code` (`atom`, `read`, `update`, `derive`,
 * `memberOf`), the same helpers as `STATE_LIBRARY_SOURCE` for a bundler, and the element table and
 * tree checks of `./mods/elements` (every name of that entry, `UI_SURFACES` among them) with the element constructors (`elementFn`, `elementNameOf`) and
 * the JSX factory (`h`, `Fragment`), `selects` (what `on` registers and a guest's `next.is` answers),
 * `matchesEvent` (a hook's matcher tested in this thread), `isHookBody`, `deepFreeze` and
 * `frozenCopy`, and `plainDataProblem`. The same names are in `./mods`.
 */
export {
  atom,
  INSTRUCTION_FILE_KINDS,
  TIERS,
  derive,
  memberOf,
  read,
  update,
  type Atom,
  type AtomKey,
  type Derived,
  type StateHost,
  type StateSource,
  type StateValue,
} from '../mods/api/state-library.ts';
export { STATE_LIBRARY_SOURCE } from '../mods/api/state-library-source.ts';
export { selects } from '../mods/chain/select.ts';
export { acceptsField, matchesEvent } from '../mods/chain/match-local.ts';
export { isHookBody } from '../mods/chain/hook-body.ts';
export { deepFreeze, frozenCopy, type DeepReadonly } from '../foundation/freeze.ts';
export { plainDataProblem, type PlainDataProblem } from '../foundation/plain-data.ts';
export * from './mod-elements.ts';
