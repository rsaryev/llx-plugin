import type { BackgroundDelivery } from '../verdict/types.ts';

/**
 * What a host takes from the deliveries of background hooks (hooks.md, "How async hooks execute"):
 * the `additionalContext` and `systemMessage` texts "for Claude on the next conversation turn", and
 * the text an `asyncRewake` hook that exited 2 "wakes Claude" with, surfaced apart so the host can
 * open a turn for it.
 */
export interface SettledDeliveries {
  readonly additionalContext: readonly string[];
  readonly systemMessages: readonly string[];
  /** Present when at least one hook woke Claude; several wake texts join with a newline. */
  readonly wake?: string;
}

/** The deliveries as one value, in the order given; pure. */
export function groupDeliveries(deliveries: readonly BackgroundDelivery[]): SettledDeliveries {
  const wakes = deliveries.flatMap((delivery) => delivery.wake ?? []);
  return {
    additionalContext: deliveries.flatMap((delivery) => delivery.additionalContext ?? []),
    systemMessages: deliveries.flatMap((delivery) => delivery.systemMessage ?? []),
    ...(wakes.length === 0 ? {} : { wake: wakes.join('\n') }),
  };
}

/**
 * Waits for the promises of `HookOutcome.background` and groups what they delivered, in the order of
 * the promises. Judgment (spec/judgments.md): a promise that rejects (the runner lost the process)
 * delivers nothing and does not hide the others; the dispatch already reported the run.
 */
export async function settleDeliveries(
  background: readonly Promise<BackgroundDelivery>[],
): Promise<SettledDeliveries> {
  const settled = await Promise.all(
    background.map((promise) =>
      promise.then(
        (delivery) => [delivery],
        () => [],
      ),
    ),
  );
  return groupDeliveries(settled.flat());
}
