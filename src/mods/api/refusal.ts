import type { Deps } from './call.ts';
import { QUEUE_DROPS } from './gate.ts';

/**
 * What a call that starts new work returns when the session refuses it (plugins/mods/api.md, "What
 * refused calls return"): `$.prompt.submit` resolves with `{ drop }`, `$.command.run` rejects,
 * `$.agent.spawn` resolves with `{ deny }`, and a `$.tool.call` that starts background work resolves
 * with `{ deny }`. The check runs where the host's effect would, after the hooks of the mods before.
 */

/** The calls the session refuses. */
export type RefusableCall = 'prompt.submit' | 'command.run' | 'agent.spawn' | 'tool.call';

/** A refused call either resolves with an answer or rejects with a message. */
type Refused = { readonly answer: unknown } | { readonly error: string };

type Request = Readonly<Record<string, unknown>>;
type Core = (event: unknown) => Promise<unknown>;

/** "Bash with `run_in_background: true`, Monitor, or CronCreate" (api.md, "What refused calls return"). */
const STARTS_BACKGROUND_WORK: ReadonlySet<string> = new Set(['Monitor', 'CronCreate']);

const isRecord = (value: unknown): value is Request =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Judgment: the flag sits among the call's arguments, flat as `{ tool, ...arguments }` or in `input`. */
const runsInBackground = (request: Request): boolean =>
  request.run_in_background === true ||
  (isRecord(request.input) && request.input.run_in_background === true);

const startsBackgroundWork = (request: Request): boolean => {
  const tool = String(request.tool);
  return STARTS_BACKGROUND_WORK.has(tool) || (tool === 'Bash' && runsInBackground(request));
};

/** What differs per call: its refused result, or none when this call is not one the session refuses. */
const REFUSALS: {
  readonly [K in RefusableCall]: (reason: string, request: Request) => Refused | undefined;
} = {
  'prompt.submit': (reason) => ({ answer: { drop: reason } }),
  'command.run': (reason) => ({ error: reason }),
  'agent.spawn': (reason) => ({ answer: { deny: reason } }),
  'tool.call': (reason, request) =>
    startsBackgroundWork(request)
      ? {
          answer: {
            deny: `${String(request.tool)} was not run: it starts background work, a schedule or a goal, and ${reason}`,
          },
        }
      : undefined,
};

/** `core` of a call, behind the session's check: while the session refuses new work the call returns its refusal. */
export function refusing(deps: Deps, kind: RefusableCall, core: Core): Core {
  return async (event) => {
    const reason = await deps.gate.refusal();
    const request = isRecord(event) ? event : {};
    const refused = reason === undefined ? undefined : REFUSALS[kind](reason, request);
    if (refused === undefined || reason === undefined) return core(event);
    deps.gate.refused(reason);
    if ('error' in refused) throw new Error(`${deps.plugin}: $.${kind}: ${refused.error}`);
    return refused.answer;
  };
}

/**
 * A call that waits in the session's queue until it runs: when the user stops the turn first, the
 * queue drops it (api.md, "Work your mod started before the interruption"). `interruption` aborts
 * then; `started` is the host's effect, given a signal of this call's own that aborts with it;
 * `dropped` makes the answer, or throws.
 */
export function waitsInQueue<T>(
  interruption: AbortSignal,
  started: (queue: AbortSignal) => Promise<T>,
  dropped: () => T,
): Promise<T> {
  // The host's signal is this call's own: it aborts only while the call waits, never after it ran.
  const queue = new AbortController();
  return new Promise<T>((resolve, reject) => {
    const drop = (): void => {
      queue.abort();
      try {
        resolve(dropped());
      } catch (error) {
        reject(error);
      }
    };
    interruption.addEventListener('abort', drop, { once: true });
    started(queue.signal)
      .then(resolve, reject)
      .finally(() => interruption.removeEventListener('abort', drop));
  });
}

/** The two drops. */
export const droppedPrompt = (): { readonly drop: string } => ({ drop: QUEUE_DROPS.prompt });
export const droppedCommand = (deps: Deps) => (): never => {
  throw new Error(`${deps.plugin}: $.command.run: ${QUEUE_DROPS.command}`);
};
