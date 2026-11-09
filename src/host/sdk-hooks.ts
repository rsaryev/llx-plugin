import { factSchemaOf, handlerTimeoutMs, type RegisteredHandler } from '../hooks/index.ts';
import { HOOK_EVENTS } from '../protocol/hook-events.ts';
import type { HookCallbackMatcher, HookEvent, HookInput } from '../protocol/official.ts';
import type { PluginSession } from './session.ts';
import { toSdkHookOutput } from './sdk-output.ts';

/**
 * The plugins' hooks of a session as the `hooks` option of a Claude Agent SDK query
 * (agent-sdk/hooks.md, "Configure hooks"): one callback per event, with no matcher, that dispatches
 * the event to the session and answers with the merged outcome. The session selects the handlers
 * (matchers, gates, `once`, `if`) at each call, so hooks a skill or a reload adds later still run.
 *
 * Judgment (spec/judgments.md): the SDK cancels a callback at its matcher's `timeout` ("When
 * omitted, Claude Code applies the event's default timeout"), and the kit runs each handler under
 * its own; the matcher's timeout is the longest a handler of the event had when the hooks were
 * built, so the SDK never cuts a handler before the kit would. An input the event's schema refuses
 * throws, which the SDK reports as a failed callback ("the action goes ahead").
 */

export interface SdkHooksOptions {
  /** The events to register; all official events when omitted. */
  readonly events?: readonly HookEvent[];
}

/** The longest limit, in whole seconds, among the handlers of `event`; `undefined` when none has one. */
function timeoutSecondsOf(
  event: HookEvent,
  entries: readonly RegisteredHandler[],
): number | undefined {
  const limits = entries
    .filter((entry) => entry.event === event)
    .map((entry) => handlerTimeoutMs(entry, {}))
    .filter((limit) => limit !== undefined);
  return limits.length === 0 ? undefined : Math.ceil(Math.max(...limits) / 1000);
}

function matcherOf(
  session: PluginSession,
  event: HookEvent,
  entries: readonly RegisteredHandler[],
): HookCallbackMatcher {
  const timeout = timeoutSecondsOf(event, entries);
  const callback: HookCallbackMatcher['hooks'][number] = async (
    input: HookInput,
    _toolUseId,
    { signal },
  ) => {
    const facts = factSchemaOf(event).parse(input);
    return toSdkHookOutput(await session.dispatch(event, facts, { signal }));
  };
  return timeout === undefined ? { hooks: [callback] } : { hooks: [callback], timeout };
}

/** The `hooks` option of an SDK query that runs the session's plugin hooks. */
export function sdkHooks(
  session: PluginSession,
  { events = HOOK_EVENTS }: SdkHooksOptions = {},
): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
  const entries = session.hookEntries();
  return Object.fromEntries(events.map((event) => [event, [matcherOf(session, event, entries)]]));
}
