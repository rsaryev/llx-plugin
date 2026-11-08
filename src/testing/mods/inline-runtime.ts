import type { JsonObject } from '../../foundation/index.ts';
import type { PluginIssue } from '../../format/issues.ts';
import { error } from '../../format/issues.ts';
import type { GuestHook, GuestModule, HookCall, ModRuntime } from '../../mods/ports.ts';
import type { ModMatcher } from '../../protocol/mods-events.ts';
import type { ModsApi, ModNext } from '../../mods/types.ts';

/**
 * A `ModRuntime` that runs a mod's `register` function in this process, with no eval (plugins/mods/
 * test.md: a test "loads your mod"). It hands the hooks back as stand-ins the kit's chain calls, and
 * passes each hook the mod's own `$` and the chain's `next`, so a hook runs exactly as in a session.
 */

type Out = Promise<unknown> | AsyncGenerator<unknown, unknown>;
export type HookFunction = ($: ModsApi, e: never, next: ModNext<never, Out>) => unknown;

/** `on(name, hook)` and `on(name, matcher, hook)`, which returns a registration with `.catch`. */
export type OnFunction = (
  name: string,
  matcherOrHook: ModMatcher | HookFunction,
  hook?: HookFunction,
) => { catch(handler: HookFunction): void };

/** What a hooks module exports: `register(on, options)`. */
export type RegisterFunction = (on: OnFunction, options: JsonObject) => void | Promise<void>;

const isHook = (value: ModMatcher | HookFunction | undefined): value is HookFunction =>
  typeof value === 'function';

/** An async generator function, which is what a hook on a streaming event is. */
const isGeneratorFunction = (fn: HookFunction): boolean =>
  Object.prototype.toString.call(fn) === '[object AsyncGeneratorFunction]';

interface Entry {
  readonly event: string;
  readonly matcher?: ModMatcher;
  readonly hook: HookFunction;
  handler?: HookFunction;
}

function directOf(call: HookCall): NonNullable<HookCall['direct']> {
  if (!call.direct)
    throw new Error('inlineRuntime needs the chain to pass the hook its own $ and next');
  return call.direct;
}

function guestOf(entry: Entry): GuestHook {
  const { handler } = entry;
  return {
    event: entry.event,
    ...(entry.matcher === undefined ? {} : { matcher: entry.matcher }),
    kind: isGeneratorFunction(entry.hook) ? 'generator' : 'function',
    hasCatch: handler !== undefined,
    run: (call) => {
      const { $, next } = directOf(call);
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the chain calls a hook with the event and `next` of its own event; `never` here only says the test kit does not type them
      return Reflect.apply(entry.hook, undefined, [$, call.event, next]) as Out;
    },
    ...(handler === undefined
      ? {}
      : {
          runCatch: (call) => {
            const { $, next } = directOf(call);
            return Promise.resolve(Reflect.apply(handler, undefined, [$, call.event, next]));
          },
        }),
  };
}

/** The runtime for one `register` function, which a test passes inline (`{ name, register }`) or loads from a module. */
export function inlineRuntime(register: RegisterFunction): ModRuntime {
  return {
    async load(input) {
      const entries: Entry[] = [];
      const on: OnFunction = (event, matcherOrHook, hook) => {
        const fn = isHook(matcherOrHook) ? matcherOrHook : hook;
        const index = entries.length;
        if (fn) {
          entries.push({
            event,
            ...(isHook(matcherOrHook) ? {} : { matcher: matcherOrHook }),
            hook: fn,
          });
        }
        return {
          catch(handler) {
            const entry = entries[index];
            if (entry) entry.handler = handler;
          },
        };
      };
      try {
        await register(on, input.options);
      } catch (thrown) {
        const reason = thrown instanceof Error ? thrown.message : String(thrown);
        const issues: PluginIssue[] = [error(input.entry, `${input.entry}: ${reason}`)];
        return { issues };
      }
      const module: GuestModule = {
        hooks: entries.map(guestOf),
        dispose: () => Promise.resolve(),
      };
      return { module, issues: [] };
    },
  };
}
