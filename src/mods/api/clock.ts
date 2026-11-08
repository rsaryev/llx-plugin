import { z } from 'zod';
import type { ModsNamespaceApi } from '../types.ts';
import { call, messageOf, parse, type Deps } from './call.ts';

const delay = z.number().finite().nonnegative();
const msEvent = z.looseObject({ ms: delay });
const callback = z.custom<() => unknown>((value) => typeof value === 'function', {
  error: 'the callback must be a function',
});

/** What `after` and `every` give back: `cancel()` stops the timer. */
export interface ModTimer {
  readonly cancel: () => void;
}

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

/** A timer that stops when the mod's module is unloaded ("Timers stop after the module reloads"). */
function start(deps: Deps, ms: number, repeat: boolean, run: () => unknown): ModTimer {
  const { clock } = deps.ports;
  let stop = noop;
  let stopped = false;
  const arm = (): void => {
    stop = clock.setTimer(() => {
      if (stopped) return;
      if (repeat) arm();
      fire(deps, run, repeat ? '$.clock.every' : '$.clock.after');
    }, ms);
  };
  const cancel = (): void => {
    stopped = true;
    stop();
  };
  deps.signal.addEventListener('abort', cancel, { once: true });
  arm();
  return { cancel };
}

export function clockApi(deps: Deps): ModsNamespaceApi<'clock'> {
  const { clock } = deps.ports;
  const timer =
    (repeat: boolean) =>
    async (...args: readonly unknown[]) => {
      const name = repeat ? '$.clock.every' : '$.clock.after';
      const run = parse(name, callback, args[1]);
      const ms = parse(name, delay, args[0]);
      return call(deps, repeat ? 'clock.every' : 'clock.after', { ms }, (e) =>
        Promise.resolve(start(deps, parse(name, msEvent, e).ms, repeat, run)),
      );
    };
  return {
    now: async () => call(deps, 'clock.now', {}, () => Promise.resolve(clock.now())),
    sleep: async (...args) =>
      call(deps, 'clock.sleep', { ms: parse('$.clock.sleep', delay, args[0]) }, (e) =>
        clock.sleep(parse('$.clock.sleep', msEvent, e).ms, deps.signal),
      ),
    after: timer(false),
    every: timer(true),
  };
}
