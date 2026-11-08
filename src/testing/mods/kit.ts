import { expect } from './expect.ts';
import { bindOn, mock, type On } from './mock.ts';
import { isKnownEvent } from './stubs.ts';
import type { InlineMod } from './inline-files.ts';
import type { TierName, World } from './world.ts';

/**
 * What a test file imports from `claude-code/testing` (plugins/mods/test.md): `test`, `tier`,
 * `expect` and `mock`. One kit serves one test file: `tier()` and the tests it declares are that
 * file's, and the runner reads them after the file has been evaluated.
 */

export interface TestOptions {
  /** Mods written inline, which load beside the mod under test ("Test a policy mod"). */
  readonly plugins?: readonly InlineMod[];
  /** Milliseconds the test may run; 5000 when absent (reference.md, "Limits"). */
  readonly timeoutMs?: number;
}

/** `$` of a test: `$.tool.call(input)`, `$.command.run(input)`, `$.classic.Stop(input)`, `$.ui.mount(spec)`. */
export type TestDollar = Readonly<
  Record<string, Readonly<Record<string, (input: Record<string, unknown>) => Promise<unknown>>>>
>;

/** A test's body: `$` acts as Claude Code, `on` registers stubs. */
export type TestBody = ($: TestDollar, on: On) => unknown;

export interface TestCase {
  readonly name: string;
  readonly options: TestOptions;
  readonly body: TestBody;
}

export interface TestKit {
  readonly expect: typeof expect;
  readonly mock: typeof mock;
  /** Declared as properties, so a test file may destructure them: `({ test, tier }) => ...`. */
  readonly test: TestFunction;
  /** Loads the mod under test as `prepend`, `append` or `builtin` (one call at the top of the file). */
  readonly tier: (tier: TierName) => void;
  /** What the file declared. */
  readonly cases: () => readonly TestCase[];
  /** Where the mod under test runs: `user` unless `tier()` said otherwise. */
  readonly tierName: () => TierName;
}

export interface TestFunction {
  (name: string, body: TestBody): void;
  (name: string, options: TestOptions, body: TestBody): void;
}

const TIERS: readonly TierName[] = ['user', 'prepend', 'append', 'builtin'];

export function createTestKit(): TestKit {
  const cases: TestCase[] = [];
  let placed: TierName = 'user';
  return {
    expect,
    mock,
    test: (name: string, second: TestOptions | TestBody, third?: TestBody) => {
      const body = typeof second === 'function' ? second : third;
      if (typeof name !== 'string' || body === undefined) {
        throw new TypeError('test(name, [options], body) takes a name and a function');
      }
      cases.push({ name, options: typeof second === 'function' ? {} : second, body });
    },
    tier: (tier) => {
      if (!TIERS.includes(tier)) throw new TypeError(`tier("${tier}"): use ${TIERS.join(', ')}`);
      placed = tier;
    },
    cases: () => cases,
    tierName: () => placed,
  };
}

/** The `on` of one test: stubs register until the test first calls `$`, and only for a known event. */
export function createOn(world: World): On {
  const on: On = (name, hook) => {
    if (world.hasStarted()) throw new Error(`on("${name}") after the test first called $`);
    if (!isKnownEvent(name)) throw new Error(`on("${name}"): "${name}" is not an event`);
    world.stub(name, hook);
  };
  bindOn(on, world);
  return on;
}
