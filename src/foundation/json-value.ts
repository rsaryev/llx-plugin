import { z } from 'zod';
import type { JsonValue } from './plain-data.ts';

const json = z.json();

/**
 * `value` as JSON writes it (what a file of the host would hold), or `undefined` when JSON cannot
 * write it: a cycle, a function, a bigint, or nothing to write. A property that is `undefined` is
 * left out, as `JSON.stringify` leaves it out.
 */
export function toJsonValue(value: unknown): JsonValue | undefined {
  try {
    const text = JSON.stringify(value);
    return text === undefined ? undefined : json.parse(JSON.parse(text));
  } catch {
    return undefined;
  }
}
