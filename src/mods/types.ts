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
import type { ModsMethod, ModsNamespace } from '../protocol/mods-api-names.ts';

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
  ? AsyncGenerator<ChunkOf<N>, ResultOf<N>>
  : Promise<ResultOf<N>>;

/** A method of the mods API: every call is asynchronous, as it is an event through the chain and then a port. */
export type ModsMember = (...args: readonly unknown[]) => Promise<unknown>;

/** What `$.clock.after` and `$.clock.every` give back: `cancel()` stops the timer, also one whose event is still on its way through the chain. */
export interface ModTimer {
  readonly cancel: () => void;
}

/** `$.clock.after` and `$.clock.every` return their timer at once, as `setTimeout` does (api.md, "Run work in the background"). */
export type ModsTimerMember = (...args: readonly unknown[]) => ModTimer;

/** The calls that return a timer and not a promise. */
type TimerEventName = 'clock.after' | 'clock.every';

/** `$.process.spawn` streams the command's output, so it returns the stream and not a promise (api.md, "Reach files, processes, and the network"). */
export type ModsStreamMember = (...args: readonly unknown[]) => AsyncGenerator<unknown, unknown>;

/** `$`: the namespaces of the mods API, each holding its methods by name. */
export type ModsNamespaceApi<N extends ModsNamespace> = {
  readonly [M in ModsMethod<N>]: `${N}.${M}` extends StreamEventName
    ? ModsStreamMember
    : `${N}.${M}` extends TimerEventName
      ? ModsTimerMember
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

/** The tiers a hook can skip to with `next.to`. */
export type SkipTier = Extract<ModTier, 'append' | 'builtin' | 'core'>;

/** `next`: the following hooks, then Claude Code's own behaviour (reference.md, "The hook function"). */
export interface ModNext<E, Out> {
  (e: E): Out;
  readonly signal: AbortSignal;
  readonly origin: HookOrigin;
  readonly budget: { readonly ms: number; readonly remainingMs: number };
  readonly to: (e: E, tier: SkipTier) => Out;
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
}

/** One line the chain reports when it skips a hook: `my-mod: tool.call hook skipped: threw Error: boom`. */
export interface HookReport {
  readonly plugin: string;
  readonly event: string;
  readonly reason: string;
  readonly line: string;
}

/**
 * An event fired from inside a mods API call made by `plugin`: that mod's own hooks are skipped.
 * The host says which of the two causes apply (reference.md, "The hook function", `next.error.cause`)
 * and the chain picks the one a handler sees: `rewritten` wins over `lent`.
 */
export interface ReentryInfo {
  readonly plugin: string;
  /** A `tool.call` or `PreToolUse` hook changed the mods API call, or an `agent.spawn` hook changed the agent it started. */
  readonly rewritten?: boolean;
  /** A method another mod adds to the mods API fired the event. */
  readonly lent?: boolean;
}

/**
 * What the events part of mods tells the chain about the events it knows (reference.md, "Events").
 * Every member is optional: an event with no rule passes its results and changed events through.
 */
export interface EventRules {
  /**
   * Why a hook's result is the wrong shape for `event`, or `undefined` when it fits. `answered` is
   * true when the hook had already called `next`.
   */
  shapeProblem(event: string, result: unknown, answered: boolean): string | undefined;
  /** Why the event a hook passes to `next` is refused, comparing it with the one the hook received. */
  changeProblem(event: string, original: unknown, changed: unknown): string | undefined;
  /** What Claude Code's own behaviour receives, from the event as fired and the one the hooks passed on. */
  coreInput(event: string, original: unknown, passed: unknown): unknown;
  /** A hook's result as it counts, for example with an over-long reason cut. */
  settle(event: string, result: unknown): unknown;
}

export interface DispatchOptions {
  /** Whoever fires the event: Claude Code is `ENGINE_ORIGIN`. */
  readonly origin: HookOrigin;
  /** Aborts when the event is abandoned, for example when the user interrupts. */
  readonly signal: AbortSignal;
  /** Claude Code's own behaviour, at the end of the chain. A streaming event gives a stream. */
  readonly core: (e: unknown) => Promise<unknown> | AsyncGenerator<unknown, unknown>;
  readonly report: (report: HookReport) => void;
  readonly reentry?: ReentryInfo;
  /**
   * The mod whose mods API call fires the event: only the hooks of the mods that run before it
   * handle the event, and its own are skipped as a re-entry (reference.md, "Mods API calls": "A hook
   * on one intercepts calls from the mods that run after it").
   */
  readonly caller?: HookOrigin;
  /** The limit all the hooks of the event share, in milliseconds; `session.end` has one by default. */
  readonly groupMs?: number;
}

export interface ModChain {
  /** Adds a mod's hooks to the chains. Any issue refuses the whole module: none of its hooks is added. */
  register(
    plugin: ModPluginInfo,
    tier: RegisterTier,
    hooks: readonly RegisteredHook[],
  ): readonly PluginIssue[];
  unregister(plugin: string): void;
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
