import type { AsyncContextFactory } from './ports.ts';

/** A value that follows the async calls made inside `run`, read back by `current`. */
export interface AsyncSlot<T extends object> {
  run<R>(value: T, callback: () => R): R;
  current(): T | undefined;
}

/**
 * A slot over a fresh context of the host's (`AsyncContextFactory`), or `undefined` without one. The
 * slot answers only values it stored itself: what the context holds is otherwise unknown.
 */
export function asyncSlot<T extends object>(
  factory: AsyncContextFactory | undefined,
): AsyncSlot<T> | undefined {
  if (factory === undefined) return undefined;
  const context = factory();
  const stored = new WeakSet<object>();
  const isOwn = (value: unknown): value is T =>
    typeof value === 'object' && value !== null && stored.has(value);
  return {
    run(value, callback) {
      stored.add(value);
      return context.run(value, callback);
    },
    current() {
      const value = context.getStore();
      return isOwn(value) ? value : undefined;
    },
  };
}
