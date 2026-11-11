/**
 * Whether a hook's answer is a body it streams: an async generator (or another async iterator with
 * `next`), which is what a hook on a streaming event is (claude-code/index.d.ts:13444,
 * `StreamHookBody`). A leaf, so a runtime in an isolate tells the two forms apart the way the chain does.
 */
export const isHookBody = (value: unknown): value is AsyncGenerator<unknown, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  Symbol.asyncIterator in value &&
  'next' in value &&
  typeof value.next === 'function';
