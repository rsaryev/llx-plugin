import type { ReentryCause } from '../../protocol/mods-events.ts';
import { reentered, type Failure } from './failure.ts';
import type { ReentryInfo } from '../types.ts';

/**
 * Which cause a re-entry has (reference.md, "The hook function", `next.error.cause`): `rewritten`
 * when a `tool.call` or `PreToolUse` hook changed the mods API call the event came from, or an
 * `agent.spawn` hook changed the agent that call started; `lent` when a method another mod adds
 * to the mods API fired the event, unless `rewritten` also applies. `undefined` when neither does.
 */
function reentryCause(flags: ReentryInfo): ReentryCause | undefined {
  if (flags.rewritten === true) return 'rewritten';
  return flags.lent === true ? 'lent' : undefined;
}

/** The failure of a hook skipped because the event came from inside a mods API call by its own mod. */
export function reentryFailure(
  plugin: string,
  reentry: ReentryInfo | undefined,
): Failure | undefined {
  return reentry?.plugin === plugin ? reentered(plugin, reentryCause(reentry)) : undefined;
}
