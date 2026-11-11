import { HOOK_EVENTS } from './hook-events.ts';
import { MODS_API, type ModsMethod, type ModsNamespace } from './mods-api-names.ts';
import type { HookEvent } from './official.ts';
import type { Assert, Equal } from './type-equality.ts';

/**
 * The events a mod can handle that have a name of their own, by group (plugins/mods/reference.md,
 * "Events"). The settings hook events (`classic.<Event>`) and the mods API calls (`fs.read`…) are
 * events too, and are derived from their own tables below.
 */
export const MOD_EVENT_GROUPS = {
  tools: ['tool.call', 'tool.check', 'tool.describe'],
  prompts: [
    'prompt.submit',
    'prompt.fill',
    'prompt.suggest',
    'prompt.edit',
    'prompt.autocomplete',
    'prompt.compose',
    'prompt.section',
    'prompt.context',
    'prompt.attachment',
    'prompt.mention',
    'skill.prompt',
    'attribution.text',
  ],
  commands: ['command.run', 'command.describe', 'config.set', 'config.describe', 'settings.read'],
  turns: ['turn.start', 'turn.step', 'turn.complete'],
  session: [
    'session.start',
    'session.end',
    'session.compact',
    'session.receive',
    'session.send',
    'session.append',
    'session.attach',
    'session.detach',
    'session.measure',
  ],
  subagents: ['agent.offer', 'agent.spawn'],
  interface: [
    'ui.render',
    'ui.resolve',
    'ui.press',
    'ui.input',
    'ui.select',
    'ui.focus',
    'ui.scroll',
    'ui.close',
    'ui.message',
    'ui.fault',
  ],
  mods: ['plugin.register', 'engine.create'],
  telemetry: ['telemetry.log', 'telemetry.mark'],
} as const;

export type ModEventGroup = keyof typeof MOD_EVENT_GROUPS;

/** The 48 documented events, flat, in the order of the reference. */
export const MOD_EVENT_NAMES = [
  ...MOD_EVENT_GROUPS.tools,
  ...MOD_EVENT_GROUPS.prompts,
  ...MOD_EVENT_GROUPS.commands,
  ...MOD_EVENT_GROUPS.turns,
  ...MOD_EVENT_GROUPS.session,
  ...MOD_EVENT_GROUPS.subagents,
  ...MOD_EVENT_GROUPS.interface,
  ...MOD_EVENT_GROUPS.mods,
  ...MOD_EVENT_GROUPS.telemetry,
] as const;
export type ModEventName = (typeof MOD_EVENT_NAMES)[number];

/**
 * The engine's own events the declarations name and the reference page does not (AGENTS.md, E2a:
 * the declarations win): `prompt.change`, raised after the prompt box changed
 * (claude-code/index.d.ts:4416, `PromptChangeInput`).
 */
export const DECLARED_EVENT_NAMES = ['prompt.change'] as const;
export type DeclaredEventName = (typeof DECLARED_EVENT_NAMES)[number];

/** Every event of the engine's own with a name of its own: the reference's, then the declarations' others. */
export const ENGINE_EVENT_NAMES = [...MOD_EVENT_NAMES, ...DECLARED_EVENT_NAMES] as const;
export type EngineEventName = (typeof ENGINE_EVENT_NAMES)[number];

/**
 * The documented events a mod's `$` call fires as the host serves it, not as the engine's own event:
 * they are in the declarations' `OpEventOf` (claude-code/index.d.ts:7491, :7672), not in
 * `EventCalls` (:5011).
 */
const HOST_SERVED: ReadonlySet<string> = new Set<ModEventName>(['settings.read', 'ui.close']);

/**
 * Whether `name` is one of the engine's own events (`EventCalls`, claude-code/index.d.ts:5011): a
 * mod's call of one "runs the same chain with the calling hook alone skipped", every hook below the
 * caller included. A call the host serves (`OpEventOf`, :7292) reaches only the hooks above the caller.
 */
export const isEngineOwnEvent = (name: string): boolean =>
  MOD_EVENT_SET.has(name) && !HOST_SERVED.has(name);
const MOD_EVENT_SET: ReadonlySet<string> = new Set(ENGINE_EVENT_NAMES);

/** The event of a settings hook event: `classic.Stop`, `classic.PostToolUse`. `e` is the hook's stdin JSON. */
export type ClassicEventName = `classic.${HookEvent}`;
export const CLASSIC_EVENT_NAMES: readonly ClassicEventName[] = HOOK_EVENTS.map(
  (event): ClassicEventName => `classic.${event}`,
);

/** The event of a mods API call: `fs.read`, `model.complete`, `ui.open`. */
/**
 * The members of the table that are values, not calls: `$.plugin.name` and `$.plugin.root` are
 * "this plugin's name and directory" (reference.md, "Mods API methods"). A value fires no event, so
 * these are not events (judgment: the table lists them under "Methods", and the events are "every
 * mods API method").
 */
type ApiValue = 'plugin.name' | 'plugin.root';
/**
 * `$.prompt.media` is "The engine's own read, no event: no hook answers for it"
 * (claude-code/index.d.ts:3137), so it is no event either.
 */
type ApiNoEvent = ApiValue | 'prompt.media';
const API_VALUES: ReadonlySet<string> = new Set<ApiNoEvent>([
  'plugin.name',
  'plugin.root',
  'prompt.media',
]);

export type ApiEventName = Exclude<
  {
    [N in ModsNamespace]: `${N}.${ModsMethod<N>}`;
  }[ModsNamespace],
  ApiNoEvent
>;
export const API_EVENT_NAMES: readonly string[] = Object.entries(MODS_API)
  .flatMap(([namespace, methods]) => methods.map((method) => `${namespace}.${method}`))
  .filter((name) => !API_VALUES.has(name));

export type AnyModEventName = EngineEventName | ClassicEventName | ApiEventName;

/** The wildcards `on` takes in place of an event name (events.md, "Filter which events a hook handles"). */
export const WILDCARDS = ['classic.*', '*'] as const;
export type Wildcard = (typeof WILDCARDS)[number];

/**
 * The events a hook handles as an async generator, because the event streams (reference.md,
 * "Events": hooks on `turn.step` and `process.spawn` are async generators; every other hook is an
 * async function).
 */
// The layer gate reads `process` and a dot in code as the global, so the namespace is named once, apart.
const PROCESS_NAMESPACE = 'process';
export const STREAM_EVENTS = [
  'turn.step',
  `${PROCESS_NAMESPACE}.spawn`,
] as const satisfies readonly (ModEventName | ApiEventName)[];
export type StreamEventName = (typeof STREAM_EVENTS)[number];

/**
 * The telemetry events. `*` does not match them; a hook on one takes its own name and the filter
 * `{ to: 'collector' }` (reference.md, "Telemetry").
 */
export const TELEMETRY_EVENTS = MOD_EVENT_GROUPS.telemetry;
export const TELEMETRY_FILTER = { to: 'collector' } as const;

export { MOD_TIERS, type ModTier } from './mods-tiers.ts';
import type { ModTier } from './mods-tiers.ts';

/** `{ plugin, tier }` of whoever fired an event. Claude Code itself is `{ plugin: 'engine', tier: 'core' }`. */
export interface HookOrigin {
  readonly plugin: string;
  readonly tier: ModTier;
}
export const ENGINE_ORIGIN: HookOrigin = { plugin: 'engine', tier: 'core' };

/** `HookFailure.kind` (claude-code/index.d.ts:5448): a hook threw or misreturned, or ran over its time. */
export const HOOK_FAILURE_KINDS = ['throw', 'timeout'] as const;
export type HookFailureKind = (typeof HOOK_FAILURE_KINDS)[number];

/**
 * Why a hook's `.catch` handler is asked to answer: `next.error` (claude-code/index.d.ts:5447,
 * `HookFailure`). Declarations 2.1.321 over reference.md, "The hook function" (spec/judgments.md):
 * a hook skipped for re-entry is not a failure its handler hears of, so there is no `re-entry` kind
 * and no `cause`; oracle 2.1.322 agrees.
 */
export interface HookFailure {
  readonly kind: HookFailureKind;
  /**
   * What was thrown or why the worker ended, or for a timeout what the last `next()` rejected
   * with; absent for a timeout with nothing rejected.
   */
  readonly message?: string;
  /** The grace the handler runs under, in milliseconds (`MOD_LIMITS.catchMs`). */
  readonly budget: number;
}

export type { ModMatcher, ModMatcherValue } from './mods-matcher.ts';

/** @public Drift guard: every settings hook event the SDK names has a `classic.` event. */
export type ClassicEventsMatchSdk = Assert<
  Equal<(typeof CLASSIC_EVENT_NAMES)[number], `classic.${HookEvent}`>
>;
