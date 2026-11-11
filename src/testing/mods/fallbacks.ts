import { API_EVENT_NAMES } from '../../protocol/mods-events.ts';
import { isEngineEvent, isEventAnswered } from '../../mods/api/call.ts';
import { noImplementation } from './fake-ports.ts';

/**
 * What no stub answers (plugins/mods/test.md, "Look up what a stub returns"): "Every mods API call
 * your mod makes in a test needs a stub that answers in Claude Code's place, except the few the kit
 * answers itself: `$.ui.invalidate`, `$.state`, and `$.session.append` calls" (the clock is
 * `mock.clock`'s, and has its own fallbacks). A call without a stub rejects with `no implementation
 * for <name>`. A call that ends in a port fails there; `unansweredReason` fails the
 * calls that have no port (`command.register`, `ui.toast`, `store.set`, `env.get`...), at the end of
 * the chain: a mod that observes or rewrites a call still does before it fails.
 */

/** The calls the kit answers itself, or the clock answers once the test takes it. */
const KIT_ANSWERED: ReadonlySet<string> = new Set([
  'ui.invalidate',
  'session.append',
  'state.get',
  'state.set',
  'clock.now',
  'clock.sleep',
  'clock.after',
  'clock.every',
]);

/**
 * An event Claude Code fires (`tool.call`, `config.set`) or an answered call (`command.run`) ends at
 * the stub or the port of its own: it is not a call that returns `{ value }`.
 */
const needsFallback = (name: string): boolean =>
  !KIT_ANSWERED.has(name) && !isEngineEvent(name) && !isEventAnswered(name);

/**
 * Why a call ends in nothing: `no implementation for <name>`, or `undefined` for a call whose end is
 * a port or the kit's own. The host asks it for every mods API call, after the hooks of the mods
 * before the caller (and the stubs among them) have not answered.
 */
export const unansweredReason = (name: string): string | undefined =>
  API_EVENT_NAMES.includes(name) && needsFallback(name) ? noImplementation(name) : undefined;
