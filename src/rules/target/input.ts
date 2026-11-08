/** A string field of a tool's input, or `undefined` when the input has no such string. */
export function inputString(input: unknown, field: string): string | undefined {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return undefined;
  if (!Object.hasOwn(input, field)) return undefined;
  const value: unknown = Reflect.get(input, field);
  return typeof value === 'string' ? value : undefined;
}
