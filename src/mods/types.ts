import type { DeepReadonly } from '../foundation/index.ts';
import type { PluginIssue } from '../format/index.ts';
import type {
  AnyModEventName,
  HookFailure,
  HookOrigin,
  ModMatcher,
  ModTier,
  StreamEventName,
} from '../protocol/mods-events.ts';
import type { FiredEventName, ModsMethod, ModsNamespace } from '../protocol/mods-api-names.ts';
import type { DispatchTrace, TraceEntry } from './trace-types.ts';
import type { ElementTable } from './ui/elements/table.ts';

/**
 * The contracts every part of mods compiles against: the mods API a hook receives as `$`, the
 * hook function and its `next`, what an event carries and answers, and the chain that runs the
 * hooks (plugins/mods/reference.md, "The hook function").
 */

/** The fields of an event, as plain data. */
export type ModEventInput = Readonly<Record<string, unknown>>;

/** What an event that streams carries and answers: `turn.step` and `process.spawn`. */
interface StreamDetails {
  readonly input: ModEventInput;
  /** A piece of the response, forwarded by `yield* next(e)`. */
  readonly chunk: unknown;
  readonly result: unknown;
}
/**
 * The shape of an event's input and result, for the events that have one of their own. An event
 * not listed takes `ModEventInput` and `unknown`; a stream of events narrows its entry here.
 */
type EventShapes = { readonly [N in StreamEventName]: StreamDetails };

export type EventOf<N extends AnyModEventName> = N extends keyof EventShapes
  ? EventShapes[N]['input']
  : ModEventInput;
export type ResultOf<N extends AnyModEventName> = N extends keyof EventShapes
  ? EventShapes[N]['result']
  : unknown;
export type ChunkOf<N extends StreamEventName> = EventShapes[N]['chunk'];

/** What `next(e)` gives back: a promise of the result, or for a streaming event a stream of chunks that ends in it. */
export type NextOutput<N extends AnyModEventName> = N extends StreamEventName
  ? ModHookStream<ChunkOf<N>, ResultOf<N>>
  : Promise<ResultOf<N>>;

/**
 * What `next(e)` is on a streaming event (claude-code/index.d.ts:5487, `HookStream`): the stream of
 * everything beneath, whose `result` settles with what beneath returned once it is read to its end
 * and rejects if it is closed before that.
 */
export type ModHookStream<C, R> = AsyncGenerator<C, R> & { readonly result: Promise<R> };

/** A method of the mods API: every call is asynchronous, as it is an event through the chain and then a port. */
export type ModsMember = (...args: readonly unknown[]) => Promise<unknown>;

/** What `$.clock.after` and `$.clock.every` give back: `cancel()` stops the timer, also one whose event is still on its way through the chain. */
export interface ModTimer {
  readonly cancel: () => void;
}

/** `$.clock.after` and `$.clock.every` return their timer at once, as `setTimeout` does (api.md, "Run work in the background"). */
export type ModsTimerMember = (...args: readonly unknown[]) => ModTimer;

/** The calls that return a timer and not a promise. */
export type TimerEventName = 'clock.after' | 'clock.every';
/** `$.ui.resolve(e)` answers at once: the docs destructure its result without `await` (interface.md, "Build a tree from elements"). */
export type ModsSyncMember = (...args: readonly unknown[]) => ElementTable;
export type SyncEventName = 'ui.resolve';
/** The calls declared to answer nothing (`FiredEventName`) return `undefined` at once. */
export type ModsFiredMember = (...args: readonly unknown[]) => void;

/** `$.process.spawn` streams the command's output, so it returns the stream and not a promise (api.md, "Reach files, processes, and the network"). */
export type ModsStreamMember = (...args: readonly unknown[]) => AsyncGenerator<unknown, unknown>;

/** `$`: the namespaces of the mods API, each holding its methods by name. */
export type ModsNamespaceApi<N extends ModsNamespace> = {
  readonly [M in ModsMethod<N>]: `${N}.${M}` extends StreamEventName
    ? ModsStreamMember
    : `${N}.${M}` extends TimerEventName
      ? ModsTimerMember
      : `${N}.${M}` extends SyncEventName
        ? ModsSyncMember
        : `${N}.${M}` extends FiredEventName
          ? ModsFiredMember
          : ModsMember;
};

/** `$.plugin`: this plugin's name and directory, which are values, not calls (reference.md, "Mods API methods"). */
export interface PluginNamespace {
  readonly name: string;
  readonly root: string;
}

export type ModsApi = {
  readonly [N in Exclude<ModsNamespace, 'plugin'>]: ModsNamespaceApi<N>;
} & { readonly plugin: PluginNamespace };

/**
 * The tiers a mod registers in. `core` is Claude Code's own behaviour at the end of the chain, not
 * a tier a mod lives in: a hook there would be run by `next.to(e, 'core')` instead of being skipped.
 */
export type RegisterTier = Exclude<ModTier, 'core'>;

/** The tiers a hook can skip to with `next.to` (claude-code/index.d.ts:13622, `TargetTier`): every tier but `prepend`. */
export type SkipTier = Exclude<ModTier, 'prepend'>;

/** `next`: the following hooks, then Claude Code's own behaviour (reference.md, "The hook function"). */
export interface ModNext<E, Out> {
  (e: E): Out;
  readonly signal: AbortSignal;
  readonly origin: HookOrigin;
  readonly budget: { readonly ms: number; readonly remainingMs: number };
  readonly to: (e: E, tier: SkipTier) => Out;
  /** The name of this dispatch's event (claude-code/index.d.ts:7018). */
  readonly event: string;
  /** Whether this dispatch's event is selected by `pattern`: a name, `*`, `ns.*` or `!pattern` (claude-code/index.d.ts:7013). */
  readonly is: (pattern: string, e: unknown) => boolean;
  /** What settled beneath this hook on its latest `next()` call, nearest first, the engine's last (claude-code/index.d.ts:7039). */
  readonly trace: readonly TraceEntry[];
}
/** `next` in a `.catch` handler: the failure, and whether the hook had called `next`. */
export interface ModCatchNext<E, Out> extends ModNext<E, Out> {
  readonly error: HookFailure;
  readonly called: boolean;
}

export type ModHook<N extends AnyModEventName> = (
  $: ModsApi,
  e: DeepReadonly<EventOf<N>>,
  next: ModNext<EventOf<N>, NextOutput<N>>,
) => ResultOf<N> | Promise<ResultOf<N>> | AsyncGenerator<ChunkOf<StreamEventName>, ResultOf<N>>;

/** What a hook registers: the event (or `*` or `classic.*`), an optional matcher, and the hook. */
export interface RegisteredHook {
  readonly event: string;
  readonly matcher?: ModMatcher;
  /** True for an async generator, which is what a hook on a streaming event is. */
  readonly isGenerator: boolean;
  readonly run: (
    $: ModsApi,
    e: unknown,
    next: ModNext<unknown, Promise<unknown> | AsyncGenerator<unknown, unknown>>,
  ) => unknown;
  readonly catchRun?: (
    $: ModsApi,
    e: unknown,
    next: ModCatchNext<unknown, Promise<unknown> | AsyncGenerator<unknown, unknown>>,
  ) => unknown;
}

/** A loaded mod, as the chain knows it: its name, and the `$` its hooks receive. */
export interface ModPluginInfo {
  readonly name: string;
  readonly api: ModsApi;
  /** Native modules remain trusted even when the host places them in the user tier. */
  readonly isBuiltin?: boolean;
  /**
   * Where the mod runs among the mods of its tier: a lower number first, whenever it registered.
   * A host that loads mods one at a time (in the order its own settings give) gives each one; mods
   * with none run after those with one, in the order they registered (judgment).
   */
  readonly position?: number;
}

/** Admission uses the original frozen input, not a previous hook's rewrite. */
export interface HookAccess {
  readonly event: string;
  readonly tier: ModTier;
  readonly isBuiltin: boolean;
  /** The event as the host fired it: the host's own object, so an identity fact can be checked on it. */
  readonly input: unknown;
}

/**
 * Why a hook was skipped, as the line classes it: it threw, it ran over a time limit, or what it
 * returned had the wrong shape (troubleshoot.md, "`hook skipped`": "A hook threw, exceeded its time
 * limit, or returned a result of the wrong shape"); `linger`: still running `MOD_LIMITS.lingerMs` past
 * its aborted `next.signal`. A hook skipped for re-entry is not reported (spec/judgments.md).
 */
export type SkipKind = 'throw' | 'timeout' | 'wrong-shape' | 'linger';

/** One line the chain reports when it skips a hook: `my-mod: tool.call hook skipped: threw Error: boom`. */
export interface HookReport {
  readonly plugin: string;
  readonly event: string;
  /** The class of failure: the line is shown once for each event and kind until the mod reloads. */
  readonly kind: SkipKind;
  readonly reason: string;
  readonly line: string;
}

/**
 * An event fired from inside a mods API call made by `plugin`: that mod's calling hook, or every
 * hook of it for a call from its code outside its hooks, is skipped, quietly and with no `.catch`
 * handler asked (declarations 2.1.321; oracle 2.1.322, spec/judgments.md).
 */
export interface ReentryInfo {
  readonly plugin: string;
}

/**
 * What the kit says about one event (reference.md, "Events"). Every member is optional: an event
 * with no rule, or a member left out, passes its results and changed events through.
 */
export interface EventRule {
  /**
   * Why a hook's result is the wrong shape, or `undefined` when it fits. `answered` is true when the
   * hook had called `next` and returned something other than what `next` gave it; `input` is the
   * event as fired, for a rule that depends on it (a tree is judged by its site and app). A hook that
   * returns what `next` gave it unchanged is not judged again.
   */
  readonly shapeProblem?: (
    result: unknown,
    answered: boolean,
    input: unknown,
  ) => string | undefined;
  /** Why the event a hook passes to `next` is refused, comparing it with the one the hook received. */
  readonly changeProblem?: (original: unknown, changed: unknown) => string | undefined;
  /** What Claude Code's own behaviour receives, from the event as fired and the one the hooks passed on. */
  readonly coreInput?: (original: unknown, passed: unknown) => unknown;
  /** A hook's result as it counts, for example with an over-long reason cut. */
  readonly settle?: (result: unknown) => unknown;
}

/** The rules of the events one part of mods knows, keyed by event name. */
export type EventRuleBook = Readonly<Record<string, EventRule>>;

export interface DispatchOptions {
  /** Whoever fires the event: Claude Code is `ENGINE_ORIGIN`. */
  readonly origin: HookOrigin;
  /** Aborts when the event is abandoned, for example when the user interrupts. */
  readonly signal: AbortSignal;
  /** Claude Code's own behaviour, at the end of the chain. A streaming event gives a stream. */
  readonly core: (e: unknown) => Promise<unknown> | AsyncGenerator<unknown, unknown>;
  readonly report: (report: HookReport) => void;
  /**
   * What runs before the first mod's hook (events.md, "Where settings hooks run in the order": the
   * `PreToolUse` hooks of managed settings run before the first mod's `tool.call` hook). It returns
   * `undefined` to let the chain run, or the answer of the whole event: then no hook runs, no more
   * than Claude Code's own behaviour.
   */
  readonly before?: (e: unknown) => unknown;
  readonly reentry?: ReentryInfo;
  /**
   * The mod whose mods API call fires the event: only the hooks of the mods that run before it
   * handle the event, and its own are skipped as a re-entry (reference.md, "Mods API calls": "A hook
   * on one intercepts calls from the mods that run after it").
   */
  readonly caller?: HookOrigin;
  /**
   * Only this mod's hooks handle the event: what Claude Code fires for one mod alone (`ui.message`
   * and `ui.fault` reach the mod that drew the `Client`, reference.md, "Interface").
   */
  readonly only?: string | ReadonlySet<string>;
  /** The debug log: the chain says there which mod answered without calling `next`. */
  readonly debug?: (line: string) => void;
  /** The limit all the hooks of the event share, in milliseconds; `session.end` has one by default. */
  readonly groupMs?: number;
  /** Observes each valid hook result before outer hooks can replace it (engine settings refusals). */
  readonly observeResult?: (value: unknown) => void;
  /**
   * Told once the dispatch has settled (or failed) which hooks ran and what each one did: a host's
   * diagnostics (judgment, spec/judgments.md: the docs describe no such trace).
   */
  readonly trace?: (trace: DispatchTrace) => void;
}

export interface ModChain {
  /** Adds a mod's hooks to the chains. Any issue refuses the whole module: none of its hooks is added. */
  register(
    plugin: ModPluginInfo,
    tier: RegisterTier,
    hooks: readonly RegisteredHook[],
  ): readonly PluginIssue[];
  unregister(plugin: string): void;
  /**
   * Whether a mod has a hook that handles `event` (`only` limits it to the mods named: one name or a
   * set). A host asks before it builds an event the mods would never see. A matcher is not tested.
   */
  hears(event: string, only?: string | ReadonlySet<string>): boolean;
  dispatch<N extends AnyModEventName>(
    name: N,
    input: EventOf<N>,
    options: DispatchOptions,
  ): Promise<ResultOf<N>>;
  dispatchStream<N extends StreamEventName>(
    name: N,
    input: EventOf<N>,
    options: DispatchOptions,
  ): AsyncGenerator<ChunkOf<N>, ResultOf<N>>;
}
