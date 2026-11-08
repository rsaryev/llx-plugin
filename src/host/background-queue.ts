import {
  groupDeliveries,
  type BackgroundDelivery,
  type SettledDeliveries,
} from '../hooks/index.ts';

/**
 * What the background hooks of a session delivered since the host last asked (docs/API.md, "Host and
 * sessions", "Background hooks"): `add` takes the promises of a `HookOutcome.background`, `take`
 * hands over what settled in the order it settled and forgets it.
 */
export interface BackgroundQueue {
  add(background: readonly Promise<BackgroundDelivery>[]): void;
  take(): SettledDeliveries;
}

export function createBackgroundQueue(): BackgroundQueue {
  let settled: BackgroundDelivery[] = [];
  return {
    add(background) {
      for (const promise of background) {
        promise.then(
          (delivery) => {
            settled.push(delivery);
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
  };
}
