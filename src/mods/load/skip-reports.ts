import type { HookReport, ModChain } from '../types.ts';

/**
 * Where the lines about skipped hooks go (plugins/mods/troubleshoot.md, "`hook skipped`"): "The line
 * appears once for each event and kind of failure until the mod reloads. The debug log has a line
 * for every occurrence." So the debug log gets each report, and the host's `report` (the transcript,
 * or stderr) gets the first of each mod, event and kind; a mod that is registered again or taken
 * away starts over, which is what a reload does.
 */
export interface SkipReports {
  /** The report the chain and the interface give lines to. */
  readonly report: (report: HookReport) => void;
  /** Forgets what `plugin` already reported. */
  forget(plugin: string): void;
}

export function skipReports(
  debug: (line: string) => void,
  report: (report: HookReport) => void,
): SkipReports {
  const seen = new Map<string, Set<string>>();
  return {
    report(skipped) {
      debug(skipped.line);
      const key = `${skipped.event}\u0000${skipped.kind}`;
      const keys = seen.get(skipped.plugin) ?? new Set<string>();
      seen.set(skipped.plugin, keys);
      if (keys.has(key)) return;
      keys.add(key);
      report(skipped);
    },
    forget: (plugin) => void seen.delete(plugin),
  };
}

/** `chain` that makes `reports` forget a mod when the mod is registered again or unregistered. */
export const forgettingChain = (chain: ModChain, reports: SkipReports): ModChain => ({
  ...chain,
  register(plugin, tier, hooks) {
    reports.forget(plugin.name);
    return chain.register(plugin, tier, hooks);
  },
  unregister(plugin) {
    reports.forget(plugin);
    chain.unregister(plugin);
  },
});
