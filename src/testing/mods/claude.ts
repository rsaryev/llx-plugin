import {
  CLASSIC_EVENT_NAMES,
  MOD_EVENT_NAMES,
  STREAM_EVENTS,
  type AnyModEventName,
  type StreamEventName,
} from '../../protocol/mods-events.ts';
import { mountUi, type MountHandle, type MountSpec } from './mount.ts';
import type { World } from './world.ts';

/**
 * The test's own `$` (plugins/mods/test.md, "Stub what Claude Code would answer"): it acts as Claude
 * Code. Each method fires the event of the same name through the mods' hooks and resolves to the
 * result; the stubs the test registered answer at the end of the chain. It is not the mods API a hook
 * receives: a mods API call such as `ui.close` cannot be fired from it.
 */

/** Events a test cannot fire: the interface's are fired by pressing and mounting, the two of the loader by loading. */
const NOT_FIRED: ReadonlySet<string> = new Set(['plugin.register', 'engine.create']);
const isFired = (name: string): boolean => !name.startsWith('ui.') && !NOT_FIRED.has(name);
const STREAMS: ReadonlySet<string> = new Set(STREAM_EVENTS);

type Fire = (input: unknown) => Promise<unknown> | AsyncGenerator<unknown, unknown>;

/** One method of `$`: a call for most events, a stream the test reads to its end for `turn.step`. */
function fireOf(world: World, name: AnyModEventName): Fire {
  const core = (e: unknown) => world.answer(name, e);
  if (STREAMS.has(name)) {
    return async function* (input) {
      await world.ensure();
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- `name` is one of the stream events, checked above
      return yield* world.host().fireStream(name as StreamEventName, input as never, { core });
    };
  }
  return async (input) => {
    await world.ensure();
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the test writes the event's input; the chain checks it
    return world.host().fire(name, input as never, { core });
  };
}

/** The tree `$` is: `$.tool.call`, `$.command.run`, `$.classic.Stop`, `$.ui.mount`. */
export function createClaude(world: World): Record<string, Record<string, unknown>> {
  const tree: Record<string, Record<string, unknown>> = {};
  const names: readonly string[] = [...MOD_EVENT_NAMES, ...CLASSIC_EVENT_NAMES];
  for (const name of names.filter(isFired)) {
    const [space = '', ...rest] = name.split('.');
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- `names` lists event names of the protocol, which `AnyModEventName` is the type of
    tree[space] = { ...tree[space], [rest.join('.')]: fireOf(world, name as AnyModEventName) };
  }
  tree['ui'] = { mount: (spec: MountSpec): Promise<MountHandle> => mountUi(world, spec) };
  return tree;
}
