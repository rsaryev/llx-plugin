/**
 * A plain JSON-style object: not `null`, not an array. The one guard every reader of parsed JSON,
 * YAML or a host value uses before it reads keys.
 */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
