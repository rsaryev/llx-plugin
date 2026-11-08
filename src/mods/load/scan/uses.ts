import type { PluginIssue } from '../../../format/issues.ts';

/**
 * What a static scan of a hooks module found: the events it hooks, the mods API calls it makes, the
 * environment variables and the `$.state` values it reads and writes (plugins/mods/create.md,
 * "Check what Claude Code reads from your mod"). It is what `claude plugin validate` prints and
 * what `plugin.register` hands to a policy mod as `e.uses`.
 */
export interface ScannedHook {
  /** The event as written: a name, `*` or `classic.*`. */
  readonly event: string;
  /** The filter in braces, `component=Spinner`, or `undefined` when the hook has none. */
  readonly matcher?: string;
  readonly hasCatch: boolean;
  /** The hook can refuse an action, so a `.catch` handler matters (events.md, "Handle a hook that fails"). */
  readonly isGating: boolean;
}

/** One mods API call, `store.get`, and the function of the file it is made in when the hook passed `$` to it. */
export interface ScannedCall {
  readonly name: string;
  readonly via?: string;
}

export interface ModScan {
  readonly file: string;
  /** True when the file exports a `register` function that takes `on`. */
  readonly hasRegister: boolean;
  readonly hooks: readonly ScannedHook[];
  readonly calls: readonly ScannedCall[];
  readonly envReads: readonly string[];
  readonly envWrites: readonly string[];
  readonly stateReads: readonly string[];
  readonly stateWrites: readonly string[];
  /** Relative import specifiers, which the walker follows. */
  readonly imports: readonly string[];
  readonly issues: readonly PluginIssue[];
}

/** What a policy mod reads in `e.uses` of `plugin.register`: calls without the `$.` prefix. */
export interface ModUses {
  readonly events: readonly string[];
  readonly calls: readonly string[];
  readonly envReads: readonly string[];
  readonly envWrites: readonly string[];
  readonly stateReads: readonly string[];
  readonly stateWrites: readonly string[];
}

const unique = <T>(items: readonly T[]): T[] => [...new Set(items)];

/** The hooks line entry: `ui.render{component=Spinner}`. */
export const hookLabel = (hook: ScannedHook): string =>
  hook.matcher === undefined ? hook.event : `${hook.event}{${hook.matcher}}`;

/** A call as `claude plugin validate` prints it: `$.store.get`, or `$.store.get (via loadNotes)`. */
export const callLabel = (call: ScannedCall): string =>
  call.via === undefined ? `$.${call.name}` : `$.${call.name} (via ${call.via})`;

/** The scans of every file of a module as one: what the module hooks, calls and reads. */
export function combineScans(scans: readonly ModScan[]): ModUses {
  return {
    events: unique(scans.flatMap((scan) => scan.hooks.map(hookLabel))),
    calls: unique(scans.flatMap((scan) => scan.calls.map((call) => call.name))),
    envReads: unique(scans.flatMap((scan) => scan.envReads)),
    envWrites: unique(scans.flatMap((scan) => scan.envWrites)),
    stateReads: unique(scans.flatMap((scan) => scan.stateReads)),
    stateWrites: unique(scans.flatMap((scan) => scan.stateWrites)),
  };
}
