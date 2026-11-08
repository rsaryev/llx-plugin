import { z } from 'zod';
import type { ModsNamespaceApi, ModTimer } from '../types.ts';
import { call, messageOf, parse, type Deps } from './call.ts';

const delay = z.number().finite().nonnegative();
const msEvent = z.looseObject({ ms: delay });
const callback = z.custom<() => unknown>((value) => typeof value === 'function', {
  error: 'the callback must be a function',
});

/**
 * Runs a timer's callback outside any event: "If the callback throws, the error goes to the debug
 * log and the timer runs again at the next interval" (api.md, "Run work in the background").
 */
function fire(deps: Deps, run: () => unknown, label: string): void {
  const failed = (error: unknown): void =>
    deps.debug(`${deps.plugin}: ${label} callback threw: ${messageOf(error)}`);
  try {
    Promise.resolve(run()).catch(failed);
  } catch (error) {
    failed(error);
  }
}

const noop = (): void => undefined;

/** A timer that is armed once its event has been through the chain, and stops when the mod's module is unloaded ("Timers stop after the module reloads"). */
function createTimer(deps: Deps, repeat: boolean, run: () => unknown) {
  const { clock } = deps.ports;
  let stop = noop;
  let stopped = false;
  const arm = (ms: number): void => {
    if (stopped) return;
    stop = clock.setTimer(() => {
      if (stopped) return;
      if (repeat) arm(ms);
      fire(deps, run, repeat ? '$.clock.every' : '$.clock.after');
    }, ms);
  };
  const cancel = (): void => {
    stopped = true;
    stop();
  };
  deps.signal.addEventListener('abort', cancel, { once: true });
  return { arm, timer: { cancel } satisfies ModTimer };
}

/**
 * `after` and `every` return the timer at once, as `setTimeout` does (api.md, "Run work in the
 * background": "Each returns a timer with a `cancel()` method"). The call is an event through the
 * chain: the timer is armed with the delay the hooks left, and a `cancel()` before then stops it
 * from being armed. A hook that refuses or answers in its place arms nothing, and the reason goes
 * to the debug log, since the caller has no promise to reject (judgment).
 */
const timerMember =
  (deps: Deps, repeat: boolean): ModsNamespaceApi<'clock'>['after'] =>
  (...args) => {
    const name = repeat ? '$.clock.every' : '$.clock.after';
    const run = parse(name, callback, args[1]);
    const ms = parse(name, delay, args[0]);
    const { arm, timer } = createTimer(deps, repeat, run);
    call(deps, repeat ? 'clock.every' : 'clock.after', { ms }, (e) => {
      arm(parse(name, msEvent, e).ms);
      return Promise.resolve(undefined);
    }).catch((error: unknown) => deps.debug(`${deps.plugin}: ${messageOf(error)}`));
    return timer;
  };

export function clockApi(deps: Deps): ModsNamespaceApi<'clock'> {
  const { clock } = deps.ports;
  return {
    now: async () => call(deps, 'clock.now', {}, () => Promise.resolve(clock.now())),
    sleep: async (...args) =>
      call(deps, 'clock.sleep', { ms: parse('$.clock.sleep', delay, args[0]) }, (e) =>
        clock.sleep(parse('$.clock.sleep', msEvent, e).ms, deps.signal),
      ),
    after: timerMember(deps, false),
    every: timerMember(deps, true),
  };
}
