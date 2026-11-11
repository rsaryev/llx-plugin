import type { PluginFiles, Clock } from '../../ports/index.ts';
import type { PluginIssue } from '../../format/issues.ts';
import { isModTestFile } from '../../format/mod-files.ts';
import { MOD_LIMITS } from '../../protocol/mods-limits.ts';
import type { ModCompiler, ModRuntime } from '../../mods/ports.ts';
import { hooksModulesOff, type ModsPolicyInput } from '../../mods/load/index.ts';
import { createClaude } from './claude.ts';
import { createOn, createTestKit, type TestCase, type TestKit } from './kit.ts';
import type { ModTestRuntime } from './ports.ts';
import { createWorld } from './world.ts';

/**
 * `claude plugin test [directory]` (plugins/mods/reference.md, "Commands"; test.md): runs every file
 * under the directory whose name ends in `.test.ts` or `.test.tsx`, prints what Bun's test runner
 * prints, and exits with status 1 when a test fails. The host passes the folder, the compiler and
 * the two runtimes; the kit decides what counts as a test, builds each test's world and judges it.
 */

export interface RunOptions {
  readonly files: PluginFiles;
  readonly compiler: ModCompiler;
  /** Runs the mod under test and the inline mods. */
  readonly runtime: ModRuntime;
  /** Runs the test files. */
  readonly testRuntime: ModTestRuntime;
  /** The real clock: it times each test and enforces `timeoutMs`. */
  readonly clock: Clock;
  /** The settings of the shell the command runs in; absent when nothing turns mods off. */
  readonly policy?: ModsPolicyInput;
  readonly signal?: AbortSignal;
}

export interface TestRun {
  /** What the command prints, one line each. */
  readonly lines: readonly string[];
  readonly exitCode: 0 | 1;
  readonly passed: number;
  readonly failed: number;
}

const PREFIX = 'claude plugin test:';
const SKIPPED = new Set(['node_modules']);

/** Every test file under the folder, sorted, never inside `node_modules`. */
async function testFiles(files: PluginFiles, directory = '.'): Promise<readonly string[]> {
  const found: string[] = [];
  for (const entry of (await files.list(directory)) ?? []) {
    const path = directory === '.' ? entry.name : `${directory}/${entry.name}`;
    if (entry.isDirectory && !SKIPPED.has(entry.name))
      found.push(...(await testFiles(files, path)));
    else if (entry.isFile && isModTestFile(path)) found.push(path);
  }
  return found.toSorted();
}

const hasHooksModule = async (files: PluginFiles): Promise<boolean> =>
  (await files.readText('hooks/hooks.json')) !== undefined;

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`;
const millis = (ms: number): string => `${Number.isInteger(ms) ? ms : ms.toFixed(2)}ms`;
const seconds = (ms: number): string => `${(ms / 1000).toFixed(2)}s`;
const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

interface CaseResult {
  readonly failure?: string;
  readonly reported: readonly string[];
}

/** A promise that rejects after `ms` of the real clock, and a way to stop waiting. */
function deadline(clock: Clock, ms: number): { readonly expired: Promise<never>; stop(): void } {
  let stop = (): void => undefined;
  const expired = new Promise<never>((_resolve, reject) => {
    stop = clock.setTimer(() => reject(new Error(`this test timed out after ${ms}ms`)), ms);
  });
  return { expired, stop };
}

async function runCase(options: RunOptions, kit: TestKit, test: TestCase): Promise<CaseResult> {
  const world = createWorld({
    files: options.files,
    compiler: options.compiler,
    runtime: options.runtime,
    tier: kit.tierName(),
    plugins: test.options.plugins ?? [],
  });
  world.claude = createClaude(world);
  const limit = deadline(options.clock, test.options.timeoutMs ?? MOD_LIMITS.testMs);
  let failure: string | undefined;
  try {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- `createClaude` builds the tree of namespaces a test body reads
    const claude = world.claude as Parameters<TestCase['body']>[0];
    await Promise.race([Promise.resolve(test.body(claude, createOn(world))), limit.expired]);
  } catch (error) {
    failure = messageOf(error);
  } finally {
    limit.stop();
  }
  failure ??= world.failures.length > 0 ? world.failures.join('\n') : undefined;
  await world.dispose();
  return {
    ...(failure === undefined ? {} : { failure }),
    reported: world.reports.map((report) => report.line),
  };
}

/** Failure text under a `(fail)` line, indented, with the engine's own report after it. */
function failureLines(result: CaseResult): readonly string[] {
  const lines = (result.failure ?? '').split('\n').map((line) => `  ${line}`);
  if (result.reported.length === 0) return lines;
  return [...lines, '  the engine reported:', ...result.reported.map((line) => `    ${line}`)];
}

const issueLines = (issues: readonly PluginIssue[]): readonly string[] =>
  issues.map((issue) => `  ${issue.message}`);

interface FileOutcome {
  readonly lines: readonly string[];
  readonly passed: number;
  readonly failed: number;
}

async function runFile(options: RunOptions, file: string): Promise<FileOutcome> {
  const signal = options.signal ?? new AbortController().signal;
  const header = [`${file}:`];
  const compiled = await options.compiler.compile({ files: options.files, entry: file }, signal);
  if (compiled.run === undefined) {
    return {
      lines: [...header, `(fail) ${file}`, ...issueLines(compiled.issues)],
      passed: 0,
      failed: 1,
    };
  }
  const kit = createTestKit();
  const loaded = await options.testRuntime.loadTests(
    { plugin: 'plugin', file, code: compiled.run.code, format: compiled.run.format, kit },
    signal,
  );
  if (loaded.issues.length > 0) {
    return {
      lines: [...header, `(fail) ${file}`, ...issueLines(loaded.issues)],
      passed: 0,
      failed: 1,
    };
  }
  if (kit.cases().length === 0) {
    return {
      lines: [...header, `(fail) ${file} declares no test(): nothing ran`],
      passed: 0,
      failed: 1,
    };
  }
  const lines = [...header];
  let passed = 0;
  let failed = 0;
  for (const test of kit.cases()) {
    const started = options.clock.now();
    const result = await runCase(options, kit, test);
    const took = millis(options.clock.now() - started);
    if (result.failure === undefined) {
      passed += 1;
      lines.push(`(pass) ${test.name} [${took}]`);
    } else {
      failed += 1;
      lines.push(`(fail) ${test.name} [${took}]`, ...failureLines(result));
    }
  }
  return { lines, passed, failed };
}

export async function runModTests(options: RunOptions): Promise<TestRun> {
  const off = options.policy ? hooksModulesOff(options.policy) : undefined;
  if (off !== undefined) {
    return { lines: [`${PREFIX} ${off}`], exitCode: 1, passed: 0, failed: 0 };
  }
  const found = await testFiles(options.files);
  if (found.length === 0) {
    return (await hasHooksModule(options.files))
      ? {
          lines: [`${PREFIX} no test file found (a name ending in .test.ts or .test.tsx)`],
          exitCode: 1,
          passed: 0,
          failed: 0,
        }
      : { lines: [`${PREFIX} no hooks module to load`], exitCode: 0, passed: 0, failed: 0 };
  }
  const began = options.clock.now();
  const lines: string[] = [];
  let passed = 0;
  let failed = 0;
  for (const file of found) {
    const outcome = await runFile(options, file);
    lines.push(...outcome.lines, '');
    passed += outcome.passed;
    failed += outcome.failed;
  }
  lines.push(
    ` ${passed} pass`,
    ` ${failed} fail`,
    `Ran ${plural(passed + failed, 'test')} across ${plural(found.length, 'file')}. [${seconds(options.clock.now() - began)}]`,
  );
  return { lines, exitCode: failed > 0 ? 1 : 0, passed, failed };
}
