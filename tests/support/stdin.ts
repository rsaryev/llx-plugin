/** Reads what a command hook got on stdin, narrowing it step by step instead of asserting a type. */

/** `value` as a record of unknown values, or an empty record when it is not an object. */
export function recordOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {};
}

/** The JSON a command hook read on stdin: an empty record when it read none or not an object. */
export function stdinJson(run: { readonly stdin?: string }): Record<string, unknown> {
  const parsed: unknown = JSON.parse(run.stdin ?? '{}');
  return recordOf(parsed);
}
