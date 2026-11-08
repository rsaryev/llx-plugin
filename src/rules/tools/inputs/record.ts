/** An object with string keys: what a tool input is before its table is read. Arrays and null are not. */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
