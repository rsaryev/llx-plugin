import {
  API_EVENT_NAMES,
  CLASSIC_EVENT_NAMES,
  ENGINE_EVENT_NAMES,
  STREAM_EVENTS,
  TELEMETRY_EVENTS,
} from '../../protocol/mods-events.ts';
import { selects } from './select.ts';

const STREAM_NAMES: ReadonlySet<string> = new Set(STREAM_EVENTS);
const KNOWN_NAMES: ReadonlySet<string> = new Set([
  ...ENGINE_EVENT_NAMES,
  ...CLASSIC_EVENT_NAMES,
  ...API_EVENT_NAMES,
]);

/** Every dotted prefix of an event's name (`Namespace`, claude-code/index.d.ts:6893): `ui`, `classic`, `telemetry`. */
const NAMESPACES: ReadonlySet<string> = new Set(
  [...KNOWN_NAMES].flatMap((name) =>
    name
      .split('.')
      .slice(0, -1)
      .map((_part, index, parts) => parts.slice(0, index + 1).join('.')),
  ),
);

/** Whether `pattern` selects a telemetry event, so a hook on it needs the telemetry filter. */
export const selectsTelemetry = (pattern: string): boolean =>
  TELEMETRY_EVENTS.some((event) => selects(pattern, event));

export const isKnownEvent = (event: string): boolean => KNOWN_NAMES.has(event);
/** Whether hooks on `event` are async generators, because the event streams. */
export const isStreamEvent = (event: string): boolean => STREAM_NAMES.has(event);

/** `*` or `ns.*` over a namespace of the events (`Glob`, :5353). */
const isGlob = (pattern: string): boolean =>
  pattern === '*' || (pattern.endsWith('.*') && NAMESPACES.has(pattern.slice(0, -2)));

/**
 * A pattern that names no one event: a glob, or `!` before a name or a glob other than `*`
 * (`Negation`, :6955: "`!*` would select none, so it is no pattern").
 */
export const isWildcard = (pattern: string): boolean => {
  if (!pattern.startsWith('!')) return isGlob(pattern);
  const negated = pattern.slice(1);
  return negated !== '*' && (isKnownEvent(negated) || isGlob(negated));
};

/** Every pattern `on` takes: an event's name (the settings hook events and the mods API calls among them), a glob or a negation. */
export const isOnName = (pattern: string): boolean => isKnownEvent(pattern) || isWildcard(pattern);

/**
 * Whether a hook registered under `pattern` handles `event`. A hook on a glob or a negation handles
 * it only when the hook's form fits the event's: an async function hook never sees a streaming event
 * and an async generator never sees any other (judgment: the docs give each form to one set of events).
 */
export function handles(pattern: string, isGenerator: boolean, event: string): boolean {
  if (!isWildcard(pattern)) return pattern === event;
  return selects(pattern, event) && isGenerator === isStreamEvent(event);
}
