import {
  groupDeliveries,
  type BackgroundDelivery,
  type SettledDeliveries,
} from '../hooks/index.ts';

/** Gets what one background hook delivered, as it settles (see `BackgroundQueue.listen`). */
export type BackgroundListener = (delivered: SettledDeliveries) => void;

/**
 * What the background hooks of a session delivered since the host last asked (docs/API.md, "Host and
 * sessions", "Background hooks"): `add` takes the promises of a `HookOutcome.background`, `take`
 * hands over what settled in the order it settled and forgets it, `listen` reports each delivery as
 * it settles, so a host that is idle need not poll.
 *
 * Judgments (spec/judgments.md): the queue holds every delivery until the host takes it, so a host
 * that never takes them keeps them all; it is the host's to drain. It hands over every delivery,
 * repeats included: the repeat check Claude Code makes for an async `SessionStart` hook is the host's.
 */
export interface BackgroundQueue {
  add(background: readonly Promise<BackgroundDelivery>[]): void;
  take(): SettledDeliveries;
  listen(listener: BackgroundListener): () => void;
}

const carriesSomething = (delivered: SettledDeliveries): boolean =>
  delivered.additionalContext.length + delivered.systemMessages.length > 0 ||
  delivered.wake !== undefined;

export function createBackgroundQueue(): BackgroundQueue {
  let settled: BackgroundDelivery[] = [];
  const listeners = new Set<BackgroundListener>();
  const announce = (delivery: BackgroundDelivery): void => {
    const delivered = groupDeliveries([delivery]);
    if (!carriesSomething(delivered)) return;
    for (const listener of listeners) {
      try {
        listener(delivered);
      } catch {
        // A listener that throws neither hides the delivery nor stops the others (spec/judgments.md).
      }
    }
  };
  return {
    add(background) {
      for (const promise of background) {
        promise.then(
          (delivery) => {
            settled.push(delivery);
            announce(delivery);
          },
          // A process the runner lost delivers nothing (spec/judgments.md); the queue stays usable.
          () => undefined,
        );
      }
    },
    take() {
      const taken = groupDeliveries(settled);
      settled = [];
      return taken;
    },
    listen(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
