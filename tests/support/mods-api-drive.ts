import type { ApiEventName } from '../../src/protocol/mods-events.ts';
import type { ModHostPorts } from '../../src/mods/api/index.ts';
import { withUiRules } from '../../src/mods/ui/index.ts';
import { consume, flush, fn, gen, messageOf } from './mods-chain.ts';
import { fakePorts } from '../../src/testing/mods/index.ts';
import { apiHarness, streamOf } from './mods-api.ts';
import { CALLER_TIER, CALL_SAMPLES, OWN_ANSWERS, READ_FOR_THE_EVENT } from './mods-api-samples.ts';
import { fakeInterface, uiOver } from './mods-ui.ts';

/** What a hook before the caller does with the call it sees. */
export type Answer = 'none' | 'next' | 'value' | 'deny';

/** How a call ended: the value it resolved to, or the message it rejected with. */
export type Outcome = { readonly resolved: unknown } | { readonly rejected: string };

export interface Driven {
  readonly outcome: Outcome;
  /** The events the hook saw, as the hook got them. */
  readonly seen: readonly unknown[];
  /** The port methods and interface calls that were reached, in order. */
  readonly reached: readonly string[];
  readonly debug: readonly string[];
  /** The timers armed on the clock after the call. */
  readonly timers: number;
}

/** The answer a hook gives in place of Claude Code. */
export const SENTINEL = 'answered by the hook';

/** The calls whose result is their event's own, so a hook's answer is the result as it is (test.md, "Look up what a stub returns"). */
const EVENT_ANSWERED: ReadonlySet<string> = new Set([
  'tool.call',
  'tool.check',
  'command.run',
  'prompt.submit',
  'prompt.fill',
  'prompt.suggest',
  'session.send',
  'agent.spawn',
  // A stream: what a hook returns is the command's own result, which is not unwrapped (test.md, "Follow the test kit's rules").
  'process.spawn',
]);

/** What a hook that answers in Claude Code's place returns for `event`. */
export function hookAnswer(event: ApiEventName, answer: 'value' | 'deny'): unknown {
  const own = OWN_ANSWERS[event];
  if (own) return own[answer];
  return answer === 'deny' ? { deny: REASON } : { value: SENTINEL };
}

/** Whether a hook's answer is the call's result as it is, not unwrapped from `{ value }` or turned into a rejection by `{ deny }`. */
export const isOwnResult = (event: ApiEventName): boolean =>
  EVENT_ANSWERED.has(event) || event in OWN_ANSWERS;

/** The reason a hook refuses with. */
export const REASON = 'not now';

const outcomeOf = (made: Promise<unknown>): Promise<Outcome> =>
  made.then(
    (resolved) => ({ resolved }),
    (error: unknown) => ({ rejected: messageOf(error) }),
  );

/** `ports` with every method that is called recorded, by port and method name. */
function watched(ports: ModHostPorts, reached: string[]): Partial<ModHostPorts> {
  const wrap = (port: string, value: unknown): unknown =>
    typeof value === 'object' && value !== null
      ? new Proxy(value, {
          get(target, member, receiver): unknown {
            const found: unknown = Reflect.get(target, member, receiver);
            if (typeof found !== 'function' || typeof member !== 'string') return found;
            return (...args: unknown[]): unknown => {
              reached.push(`${port}.${member}`);
              return Reflect.apply(found, target, args);
            };
          },
        })
      : value;
  // The harness keeps its own clock, which a test can move; the idle clock of the fakes never would.
  return Object.fromEntries(
    Object.entries(ports)
      .filter(([name]) => name !== 'clock')
      .map(([name, port]) => [name, wrap(name, port)]),
  );
}

/** The member of `$` that makes the call `event`. */
function member(api: object, event: string): (...args: readonly unknown[]) => unknown {
  const [namespace = '', method = ''] = event.split('.');
  const found: unknown = Reflect.get(Object(Reflect.get(api, namespace)), method);
  if (typeof found !== 'function') throw new Error(`${event} is not a call`);
  return (...args) => Reflect.apply(found, undefined, args);
}

/**
 * Makes the call `event` with its sample arguments from a mod, with a hook of a mod before it that
 * answers as `answer` says, over ports that record what they were asked.
 */
export async function drive(event: ApiEventName, answer: Answer) {
  const reached: string[] = [];
  const seen: unknown[] = [];
  const { iface, calls } = fakeInterface();
  const h = await apiHarness({
    tier: CALLER_TIER[event] ?? 'user',
    rules: withUiRules,
    ui: uiOver(iface),
    ports: watched(
      fakePorts({
        // `$.settings.read` reads the layers before it fires its event.
        settings: { layers: () => Promise.resolve([]), merged: () => ({}) },
      }).ports,
      reached,
    ),
  });
  const answered = (e: unknown): unknown => {
    seen.push(e);
    return hookAnswer(event, answer === 'deny' ? 'deny' : 'value');
  };
  if (answer !== 'none') {
    await h.mod('hook', 'prepend', [
      event === 'process.spawn'
        ? gen(event, async function* (_$, e, next) {
            if (answer === 'next') return yield* ((seen.push(e), next(e)));
            return answered(e);
          })
        : fn(
            event,
            (_$, e, next) => (answer === 'next' ? (seen.push(e), next(e)) : answered(e)),
            // A telemetry hook names the collector (reference.md, "Telemetry").
            event.startsWith('telemetry.') ? { matcher: { to: 'collector' } } : {},
          ),
    ]);
  }
  // Loading the hook's mod reaches some ports too; the call is what is measured.
  reached.length = 0;
  calls.length = 0;
  const made = member(h.api, event)(...CALL_SAMPLES[event]);
  await flush();
  const timers = h.clock.pending();
  // A call that sleeps or waits on a timer finishes when the clock moves.
  h.clock.advance(1000);
  const isTimer = event === 'clock.after' || event === 'clock.every';
  // A timer comes back at once and is never a promise; two of them are never the same object.
  const outcome: Outcome = isTimer
    ? { resolved: Object.keys(Object(made)).join() }
    : event === 'process.spawn'
      ? await outcomeOf(consume(streamOf(made)).then((out) => out.result))
      : await outcomeOf(Promise.resolve(made));
  return {
    outcome,
    seen,
    reached: [...reached, ...calls.map((c) => `interface.${c.name}`)].filter(
      (name) => !READ_FOR_THE_EVENT[event]?.includes(name),
    ),
    debug: h.debug,
    timers,
  } satisfies Driven;
}
