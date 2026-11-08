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

/** The event of a settings hook event: `classic.Stop`, `classic.PostToolUse`. `e` is the hook's stdin JSON. */
export type ClassicEventName = `classic.${HookEvent}`;
export const CLASSIC_EVENT_NAMES: readonly ClassicEventName[] = HOOK_EVENTS.map(
  (event): ClassicEventName => `classic.${event}`,
);

/** The event of a mods API call: `fs.read`, `model.complete`, `ui.open`. */
export type ApiEventName = {
  [N in ModsNamespace]: `${N}.${ModsMethod<N>}`;
}[ModsNamespace];
export const API_EVENT_NAMES: readonly string[] = Object.entries(MODS_API).flatMap(
  ([namespace, methods]) => methods.map((method) => `${namespace}.${method}`),
);

export type AnyModEventName = ModEventName | ClassicEventName | ApiEventName;

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

/**
 * A mod's priority group, in the order the chain runs them (events.md, "The order mods run in"):
 * mods your organization lists in `prependPlugins`, mods you install, `appendPlugins`, other mods
 * built into Claude Code, then Claude Code's own behaviour (`core`).
 */
export const MOD_TIERS = ['prepend', 'user', 'append', 'builtin', 'core'] as const;
export type ModTier = (typeof MOD_TIERS)[number];

/** `{ plugin, tier }` of whoever fired an event. Claude Code itself is `{ plugin: 'engine', tier: 'core' }`. */
export interface HookOrigin {
  readonly plugin: string;
  readonly tier: ModTier;
}
export const ENGINE_ORIGIN: HookOrigin = { plugin: 'engine', tier: 'core' };

export const HOOK_FAILURE_KINDS = ['throw', 'timeout', 're-entry'] as const;
export type HookFailureKind = (typeof HOOK_FAILURE_KINDS)[number];
export const REENTRY_CAUSES = ['rewritten', 'lent'] as const;
export type ReentryCause = (typeof REENTRY_CAUSES)[number];

/** Why a hook was asked to answer in its `.catch` handler: `next.error` (reference.md, "The hook function"). */
export interface HookFailure {
  readonly kind: HookFailureKind;
  readonly message: string;
  /** Set only when `kind` is `re-entry`. */
  readonly cause?: ReentryCause;
}

/** A value a matcher field can hold: a literal, or a regular expression (serialisable as `{ $regexp, flags }`). */
export type MatcherValue = string | number | boolean | RegExp | { $regexp: string; flags?: string };
/** A filter on an event's fields (events.md, "Filter which events a hook handles"). */
export interface ModMatcher {
  readonly [field: string]: MatcherValue | readonly MatcherValue[] | undefined;
}

/** @public Drift guard: every settings hook event the SDK names has a `classic.` event. */
export type ClassicEventsMatchSdk = Assert<
  Equal<(typeof CLASSIC_EVENT_NAMES)[number], `classic.${HookEvent}`>
>;
