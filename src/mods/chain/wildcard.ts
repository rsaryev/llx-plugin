import {
  API_EVENT_NAMES,
  CLASSIC_EVENT_NAMES,
  MOD_EVENT_NAMES,
  STREAM_EVENTS,
  TELEMETRY_EVENTS,
  WILDCARDS,
  type Wildcard,
} from '../../protocol/mods-events.ts';

/**
 * What each wildcard matches (events.md, "Filter which events a hook handles"): `classic.*` every
 * settings hook event, `*` every event except the telemetry events.
 */
const WILDCARD_MATCHES: { readonly [W in Wildcard]: (event: string) => boolean } = {
  'classic.*': (event) => CLASSIC_NAMES.has(event),
  '*': (event) => !TELEMETRY_NAMES.has(event),
};

const CLASSIC_NAMES: ReadonlySet<string> = new Set(CLASSIC_EVENT_NAMES);
const TELEMETRY_NAMES: ReadonlySet<string> = new Set(TELEMETRY_EVENTS);
const STREAM_NAMES: ReadonlySet<string> = new Set(STREAM_EVENTS);
const KNOWN_NAMES: ReadonlySet<string> = new Set([
  ...MOD_EVENT_NAMES,
  ...CLASSIC_EVENT_NAMES,
  ...API_EVENT_NAMES,
]);

const wildcardOf = (pattern: string): Wildcard | undefined =>
  WILDCARDS.find((wildcard) => wildcard === pattern);

export const isTelemetryEvent = (event: string): boolean => TELEMETRY_NAMES.has(event);
export const isKnownEvent = (event: string): boolean => KNOWN_NAMES.has(event);
/** Whether hooks on `event` are async generators, because the event streams. */
export const isStreamEvent = (event: string): boolean => STREAM_NAMES.has(event);
export const isWildcard = (pattern: string): boolean => wildcardOf(pattern) !== undefined;

/**
 * Whether a hook registered under `pattern` handles `event`. A wildcard hook handles it only when
 * the hook's form fits the event's: an async function hook never sees a streaming event and an
 * async generator never sees any other (judgment: the docs give each form to one set of events).
 */
export function handles(pattern: string, isGenerator: boolean, event: string): boolean {
  const wildcard = wildcardOf(pattern);
  if (wildcard === undefined) return pattern === event;
  return WILDCARD_MATCHES[wildcard](event) && isGenerator === isStreamEvent(event);
}
