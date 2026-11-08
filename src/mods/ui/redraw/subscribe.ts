import type { StateStore } from '../../api/state.ts';

export interface StateReads {
  /**
   * Runs the drawing of one site: the `$.state` values read meanwhile subscribe that site, in place
   * of what it read the last time it was drawn.
   */
  track<T>(site: string, run: () => Promise<T>): Promise<T>;
  /** Stops listening. */
  dispose(): void;
}

/**
 * "A `ui.render` hook that reads a value subscribes to it, so Claude Code redraws that site each
 * time you write the value, and you don't call `$.ui.invalidate`" (interface.md, "Keep a value in
 * `$.state`"). A write of a value any site read calls `invalidate`. Judgment: the reads of two sites
 * drawn at once are not told apart (each subscribes to both), which only redraws more.
 */
export function trackStateReads(state: StateStore, invalidate: () => void): StateReads {
  const bySite = new Map<string, ReadonlySet<string>>();
  let reading: Set<string> | undefined;
  const id = (plugin: string, key: string): string => JSON.stringify([plugin, key]);
  const stopRead = state.onRead((plugin, key) => reading?.add(id(plugin, key)));
  const stopWrite = state.onWrite((plugin, key) => {
    const written = id(plugin, key);
    if ([...bySite.values()].some((keys) => keys.has(written))) invalidate();
  });
  return {
    async track(site, run) {
      const outer = reading;
      reading = new Set<string>();
      const mine = reading;
      try {
        return await run();
      } finally {
        bySite.set(site, mine);
        reading = outer;
      }
    },
    dispose() {
      stopRead();
      stopWrite();
    },
  };
}
