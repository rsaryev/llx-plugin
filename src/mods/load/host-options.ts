import type { FetchPolicyFacts, ModHostPortsInput, RunLimits } from '../api/index.ts';
import type {
  AsyncContextFactory,
  DenyRuleChecker,
  MatcherEngine,
  ModCompiler,
  ModRuntime,
} from '../ports.ts';
import type { HookReport } from '../types.ts';
import type { ModInterface } from '../ui/index.ts';
import type { ManagedModData } from './guard-protection.ts';
import type { ModNotice } from './mod-set.ts';
import type { ModsPolicyInput } from './policy-input.ts';

/**
 * The mods runtime a host embeds (docs/API.md, "Mods"): the chain, the events, the API, the
 * interface and the loader wired together. The host passes the ports and the plugins it found;
 * the kit decides which hooks modules load, in which order and tier, and runs their hooks.
 */

export interface ModsHostOptions extends ManagedModData {
  /** The platform and session ports, and any optional ones (`ModOptionalPorts`); the kit fills the rest. */
  readonly ports: ModHostPortsInput;
  readonly iface: ModInterface;
  readonly runtime: ModRuntime;
  readonly compiler: ModCompiler;
  readonly policy: ModsPolicyInput;
  /** The permission rules, for the guard's check of a call a user's mod approved. */
  readonly deny: DenyRuleChecker;
  /** The debug log (troubleshoot.md, "Read the debug log"). */
  readonly debug?: (line: string) => void;
  /** Where the regular expressions of mods' matchers run; without one, in this thread (`MatcherEngine`). */
  readonly matcherEngine?: MatcherEngine;
  /** How long the engine has for one test of one pattern, in milliseconds (default 100). */
  readonly matcherMs?: number;
  /**
   * The transcript line (or stderr) for a skipped hook: the first of each mod, event and kind until
   * the mod reloads. The debug log gets every occurrence.
   */
  readonly report?: (report: HookReport) => void;
  readonly signal?: AbortSignal;
  /**
   * For the test kit: why a mods API call ends in nothing, or `undefined` for a call that ends in its
   * effect. The call fails with that reason once no hook before the caller has answered it.
   */
  readonly unanswered?: (name: string) => string | undefined;
  /**
   * Whether `session.start` fires for each mod after `load` and `reload` (reference.md, "Session":
   * "Once for each loaded mod ... and again after a reload of that mod"). The default is true; the test
   * kit turns it off, as "`session.start` doesn't run by itself" there (test.md).
   */
  readonly firesSessionStart?: boolean;
  /** Whether the session is interactive, for the input of `session.start` and for where a line about a mod is read (default true). */
  readonly isInteractive?: boolean;
  /**
   * Whether hot reloading is on for the mods Claude wrote in this session, read on every call so the
   * answer to the question (`HotReloadGate.enabled`) reaches the lines at once: they then reach the transcript.
   */
  readonly hotReload?: () => boolean;
  /** `claude -p --output-format`, for where a line about a mod is read (default text). */
  readonly outputFormat?: 'text' | 'json' | 'stream-json';
  /**
   * A line for people that comes outside a call to the host: the hooks worker stopped (`ModRuntime.onCrash`),
   * or a fresh copy's `session.start` did not make a call again. `load` and `reload` return their own lines.
   */
  readonly onNotice?: (notice: ModNotice) => void;
  /** The run's limits (`--max-turns`, `--max-budget-usd`): a call that would pass one is refused (`RunGate`). */
  readonly limits?: RunLimits;
  /** What the host knows about each request `$.http.fetch` sends; without it network policy stops none (admin.md). */
  readonly fetchPolicy?: FetchPolicyFacts;
  /**
   * `() => new AsyncLocalStorage()` on Bun and Node. With it a mod's `$` call skips exactly the hook
   * that made it (claude-code/index.d.ts:7298), and a `runCommand` from inside the run of the same
   * command's body (`options.core`, `ModCommands.run`) runs that body without firing `command.run`
   * again. Without it every running hook of the calling mod is skipped and a nested `runCommand`
   * fires again (docs/API.md, "The mods API").
   */
  readonly asyncContext?: AsyncContextFactory;
}
