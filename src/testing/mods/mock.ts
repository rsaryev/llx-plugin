import { createMockClock, type MockClock } from './mock-clock.ts';
import type { StubHook } from './stubs.ts';
import type { World } from './world.ts';

/**
 * The ready-made mocks of the test kit (plugins/mods/test.md, "Stub what Claude Code would answer").
 * Each takes the test's `on`, so it answers for that test's world and no other.
 */

/** The test's `on`, as `mock.*` finds the world behind it. */
export type On = (name: string, hook: StubHook) => void;

const worlds = new WeakMap<On, World>();

/** Ties a test's `on` to its world; the kit does it once for each test. */
export function bindOn(on: On, world: World): void {
  worlds.set(on, world);
}

function worldOf(on: On): World {
  const world = worlds.get(on);
  if (!world) throw new Error('mock takes the `on` a test receives');
  return world;
}

/** The mock session: the rows a mod added with `$.session.append`, oldest first. */
export interface MockSession {
  appended(): readonly unknown[];
}

const reply = (value: unknown): { value: unknown } => ({ value });

export const mock = {
  /** Answers `$.clock` from a clock that starts at `now` (0) and moves only when the test moves it. */
  clock(on: On, options: { readonly now?: number } = {}): MockClock {
    const clock = createMockClock(options.now ?? 0);
    worldOf(on).takeClock(clock);
    return clock;
  },
  /** Answers `$.store` from a store that starts with `entries`. */
  store(on: On, entries: Readonly<Record<string, unknown>> = {}): void {
    const saved = new Map<string, unknown>(Object.entries(entries));
    on('store.get', (_$, e: { key: string }) => reply(saved.get(e.key)));
    on('store.set', (_$, e: { key: string; value: unknown }) => {
      saved.set(e.key, e.value);
      return reply(undefined);
    });
    on('store.delete', (_$, e: { key: string }) => {
      saved.delete(e.key);
      return reply(undefined);
    });
    on('store.keys', () => reply([...saved.keys()]));
  },
  /** Answers `$.env.get` from `variables`. */
  env(on: On, variables: Readonly<Record<string, string>> = {}): void {
    on('env.get', (_$, e: { name: string }) => reply(variables[e.name]));
  },
  /** The rows mods appended to the conversation. */
  session(on: On): MockSession {
    const world = worldOf(on);
    return { appended: () => world.appended };
  },
};
