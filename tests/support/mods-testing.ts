import type { Clock } from '../../src/ports/index.ts';
import type { ModsPolicyInput } from '../../src/mods/load/index.ts';
import {
  inlineTests,
  moduleText,
  runModTests,
  type RegisterFunction,
  type TestKit,
  type TestRun,
} from '../../src/testing/mods/index.ts';
import { fixedClock } from './ports.ts';
import { memoryFiles } from './ports.ts';
import { policy as plainPolicy, runtimeOf, textCompiler } from './mods-load.ts';

/** A test file, as the test declares it with the kit; the runner reads the tests the function registers. */
export type TestFile = (kit: TestKit) => void | Promise<void>;

export interface PluginUnderTest {
  readonly name: string;
  /** The hooks module of the mod; absent for a plugin that holds tests only. */
  readonly register?: RegisterFunction;
  /** Test files by their path in the folder. */
  readonly tests: Readonly<Record<string, TestFile>>;
  /** Other files of the folder. */
  readonly extra?: Readonly<Record<string, string>>;
  readonly clock?: Clock;
  readonly policy?: ModsPolicyInput;
}

/** Runs `claude plugin test` over an in-memory plugin folder. */
export function runPluginTests(plugin: PluginUnderTest): Promise<TestRun> {
  const files = memoryFiles({
    '.claude-plugin/plugin.json': JSON.stringify({ name: plugin.name, version: '0.1.0' }),
    ...(plugin.register
      ? {
          'hooks/hooks.json': JSON.stringify({ modules: ['./register.js'] }),
          'hooks/register.js': moduleText(plugin.register),
        }
      : {}),
    ...Object.fromEntries(Object.keys(plugin.tests).map((path) => [path, '// the test file'])),
    ...plugin.extra,
  });
  return runModTests({
    files,
    compiler: textCompiler,
    runtime: runtimeOf(plugin.register ? { [plugin.name]: plugin.register } : {}),
    testRuntime: inlineTests(async (kit, file) => {
      await plugin.tests[file]?.(kit);
    }),
    clock: plugin.clock ?? fixedClock(),
    policy: plugin.policy ?? plainPolicy(),
  });
}
