import type { EventWithSpecificOutput, HookSpecificOutputOf } from '../../protocol/hook-events.ts';

/**
 * Reading a validated `hookSpecificOutput` without a cast: the schema already checked every field,
 * so these only look a field up and narrow it.
 */

const valueIn = (source: object | undefined, key: string): unknown =>
  source === undefined ? undefined : Object.entries(source).find(([name]) => name === key)?.[1];

export const stringIn = (source: object | undefined, key: string): string | undefined => {
  const value = valueIn(source, key);
  return typeof value === 'string' ? value : undefined;
};

export const boolIn = (source: object | undefined, key: string): boolean | undefined => {
  const value = valueIn(source, key);
  return typeof value === 'boolean' ? value : undefined;
};

/** A string with something in it: an empty `additionalContext` adds nothing. */
export const hasText = (text: string | undefined): text is string =>
  text !== undefined && text !== '';

/** A non-empty string of the field. */
export const textIn = (source: object | undefined, key: string): string | undefined => {
  const value = stringIn(source, key);
  return value === undefined || value === '' ? undefined : value;
};

export const stringsIn = (
  source: object | undefined,
  key: string,
): readonly string[] | undefined => {
  const value = valueIn(source, key);
  return Array.isArray(value) && value.every((item): item is string => typeof item === 'string')
    ? value
    : undefined;
};

const isSpecific = <E extends EventWithSpecificOutput>(
  event: E,
  source: object,
): source is HookSpecificOutputOf<E> => valueIn(source, 'hookEventName') === event;

/** `source` as the official `hookSpecificOutput` of `event`, when it is one. */
export const specificOf = <E extends EventWithSpecificOutput>(
  event: E,
  source: object | undefined,
): HookSpecificOutputOf<E> | undefined =>
  source !== undefined && isSpecific(event, source) ? source : undefined;
