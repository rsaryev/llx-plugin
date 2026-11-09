import type { BackgroundDelivery, RegisteredHandler } from '../hooks/index.ts';
import { consumedByRun } from '../hooks/select/index.ts';
import type { SessionCore } from './session-core.ts';

/**
 * hooks.md, "Common fields": a skill once hook is consumed only after success, including async
 * completion. Compare registration identity, not only its id: an old completion must not remove
 * a replacement registered while the process was running (judgment, spec/judgments.md).
 */
export function consumeBackgroundOnce(
  core: SessionCore,
  pending: readonly Promise<BackgroundDelivery>[],
  entries: readonly RegisteredHandler[],
): readonly Promise<BackgroundDelivery>[] {
  const running = new Map(entries.map((entry) => [entry.id, entry]));
  return pending.map(async (promise) => {
    const delivery = await promise;
    const entry = running.get(delivery.handlerId);
    const current = core.registry.get();
    if (
      entry !== undefined &&
      consumedByRun(entry, delivery.exitCode === 0) &&
      current.entries.includes(entry)
    ) {
      core.registry.set(current.without([entry.id]));
    }
    return delivery;
  });
}
