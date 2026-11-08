import { isRecord } from './record.ts';

/** A JSON text of a value with its object keys sorted: two values equal in content, equal text. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (!isRecord(value)) return JSON.stringify(value) ?? 'undefined';
  const fields = Object.keys(value)
    .toSorted()
    .map((name) => `${JSON.stringify(name)}:${canonical(value[name])}`);
  return `{${fields.join(',')}}`;
}
