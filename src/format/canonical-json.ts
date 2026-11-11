import { isRecord } from '../protocol/is-record.ts';
import { byCodeUnit } from './listing.ts';

/**
 * A JSON text of a value with its object keys sorted by code unit at every depth, so two values
 * equal in content are equal text: the one identity every "same entry", "same source" and "same
 * input" comparison uses. As JSON.stringify writes them, an `undefined` member is left out and an
 * `undefined` array item is `null`; a value with no JSON text (`undefined` itself) is `undefined`.
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => (item === undefined ? 'null' : canonicalJson(item))).join(',')}]`;
  }
  if (!isRecord(value)) return JSON.stringify(value) ?? 'undefined';
  const members = Object.keys(value)
    .filter((key) => value[key] !== undefined)
    .toSorted(byCodeUnit)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);
  return `{${members.join(',')}}`;
}
