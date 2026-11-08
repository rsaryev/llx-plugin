/**
 * What the kit decides about the compiler's two outputs (docs/API.md, "Mods"): the scan reads an ES
 * module (plugins/mods/create.md § Check what Claude Code reads from your mod: "Write every file as
 * an ES module"), the host's engine runs the format the host chose. The docs say nothing about a
 * second format, so this is judgments (spec/judgments.md), tested outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import type { ModCompiler, ModRuntime } from '../../../src/mods/ports.ts';
import type { CompileResult } from '../../../src/mods/load/compile-output.ts';
import { validateMod } from '../../../src/mods/load/commands/validate.ts';
import { engineStackIssue } from '../../../src/mods/load/engine-faults.ts';
import { memoryFiles } from '../../support/ports.ts';
import { inline, modPlugin, runtimeOf, session } from '../../support/mods-load.ts';

const ESM = "export function register(on) { on('tool.call', async ($, e, next) => next(e)) }";
const CJS = 'exports.register = function register(on) {}';

const noop = (on: unknown): void => void on;

/** A compiler that answers `result` whatever the module. */
const answering = (result: CompileResult): ModCompiler => ({
  compile: () => Promise.resolve(result),
});

/** A runtime that records what it was asked to load, then runs the test's `register`. */
function recording(inputs: Parameters<ModRuntime['load']>[0][]): ModRuntime {
  const inner = runtimeOf({ 'first-mod': noop });
  return {
    load: (input, signal) => {
      inputs.push(input);
      return inner.load(input, signal);
    },
  };
}

const load = async (options: Parameters<typeof session>[1]) => {
  const { host } = session({ 'first-mod': noop }, options);
  return host.load([modPlugin(inline('first-mod'), noop)]);
};

describe('the scan reads one output and the engine runs the other', () => {
  test('the scan lists the hooks of the ES module while the engine receives the CommonJS code and its format', async () => {
    const inputs: Parameters<ModRuntime['load']>[0][] = [];
    const report = await load({
      compiler: answering({
        scan: { code: ESM },
        run: { code: CJS, format: 'cjs' },
        issues: [],
      }),
      runtime: recording(inputs),
    });
    expect(report.lines).toEqual([]);
    expect(report.loaded[0]?.uses.events).toEqual(['tool.call']);
    expect(inputs.map((input) => [input.code, input.format])).toEqual([[CJS, 'cjs']]);
  });

  test('a compiler with one output gives its ES module as `run`: the scan reads it and the engine runs it', async () => {
    const inputs: Parameters<ModRuntime['load']>[0][] = [];
    const report = await load({
      compiler: answering({ run: { code: ESM, format: 'esm' }, issues: [] }),
      runtime: recording(inputs),
    });
    expect(report.lines).toEqual([]);
    expect(report.loaded[0]?.uses.events).toEqual(['tool.call']);
    expect(inputs.map((input) => [input.code, input.format])).toEqual([[ESM, 'esm']]);
  });

  test('one output that is not an ES module leaves the scan nothing to read, and the line says so', async () => {
    const report = await load({
      compiler: answering({ run: { code: CJS, format: 'cjs' }, issues: [] }),
    });
    expect(report.loaded).toEqual([]);
    expect(report.lines).toEqual([
      'first-mod: hooks module did not load: hooks/register.js: the compiler gave a cjs run output only, so there is no ES module for the scan to read',
    ]);
  });

  test('a scan output that is CommonJS is refused with a message that names the two outputs', async () => {
    const report = await load({
      compiler: answering({
        scan: { code: CJS },
        run: { code: CJS, format: 'cjs' },
        issues: [],
      }),
    });
    expect(report.loaded).toEqual([]);
    expect(report.lines).toEqual([
      'first-mod: hooks module did not load: hooks/register.js: the scan output is CommonJS, not an ES module; a compiler returns the ES module as `scan` and the format the host runs as `run` (found exports)',
    ]);
  });

  test('a scan output with require() or module.exports is CommonJS, one with an import or export is not', async () => {
    const lines = async (code: string): Promise<readonly string[]> =>
      (
        await load({
          compiler: answering({ scan: { code }, run: { code: ESM, format: 'esm' }, issues: [] }),
        })
      ).lines;
    expect((await lines("const x = require('./x.js')\nmodule.exports = { x }"))[0]).toContain(
      'the scan output is CommonJS',
    );
    expect(await lines(ESM)).toEqual([]);
    expect(await lines(`import { a } from './a.js'\n${ESM}`)).toEqual([]);
  });

  test('code the parser cannot read is the scan own message, not the CommonJS one', async () => {
    const report = await load({
      compiler: answering({
        scan: { code: 'export function register(on) {' },
        run: { code: CJS, format: 'cjs' },
        issues: [],
      }),
    });
    expect(report.lines[0]).not.toContain('CommonJS');
    expect(report.lines[0]).toMatch(/^first-mod: hooks module did not load: hooks\/register\.js: /);
  });

  test('a scan output with no run output cannot load, and the compiler own reason is the line', async () => {
    const noRun = await load({ compiler: answering({ scan: { code: ESM }, issues: [] }) });
    expect(noRun.lines).toEqual([
      'first-mod: hooks module did not load: hooks/register.js: the compiler gave no run output',
    ]);
    const why = await load({
      compiler: answering({
        issues: [{ severity: 'error', path: 'register.ts', message: 'register.ts: no such file' }],
      }),
    });
    expect(why.lines).toEqual(['first-mod: hooks module did not load: register.ts: no such file']);
  });

  test('a compiler that throws is a line, not a throw out of load', async () => {
    const report = await load({
      compiler: {
        compile: () => Promise.reject(new Error('esbuild is not installed')),
      },
    });
    expect(report.lines).toEqual([
      'first-mod: hooks module did not load: hooks/register.js: the compiler failed: esbuild is not installed',
    ]);
  });
});

describe('validate reads the scan output', () => {
  const files = memoryFiles({
    '.claude-plugin/plugin.json': JSON.stringify({ name: 'first-mod', version: '0.1.0' }),
    'hooks/hooks.json': JSON.stringify({ modules: ['./register.ts'] }),
    'hooks/register.ts': 'export function register(on: unknown): void {}',
  });

  test('a compiler with a scan output and no run output is enough: validate runs nothing', async () => {
    const report = await validateMod({
      files,
      target: '.',
      compiler: answering({ scan: { code: ESM }, issues: [] }),
    });
    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain('  ❯ ./register.ts hooks: tool.call');
  });

  test('validate reads the compiler scan output and the engine runs another output of the same mod', async () => {
    const report = await validateMod({
      files,
      target: '.',
      compiler: answering({ scan: { code: ESM }, run: { code: CJS, format: 'cjs' }, issues: [] }),
    });
    expect(report.exitCode).toBe(0);
    expect(report.lines).toContain('  ❯ ./register.ts hooks: tool.call');
  });

  test('a CommonJS scan output with a warning among the issues still fails with the scan message, not the warning', async () => {
    const report = await validateMod({
      files,
      target: '.',
      compiler: answering({
        scan: { code: CJS },
        run: { code: CJS, format: 'cjs' },
        issues: [
          { severity: 'warning', path: 'register.ts', message: 'register.ts: unused import' },
        ],
      }),
    });
    expect(report.exitCode).toBe(1);
    const text = report.lines.join('\n');
    expect(text).toContain('the scan output is CommonJS, not an ES module');
    expect(text).not.toContain('unused import');
  });

  test('a compiler with no output at all gives its own first issue', async () => {
    const report = await validateMod({
      files,
      target: '.',
      compiler: answering({
        issues: [{ severity: 'error', path: 'register.ts', message: 'register.ts: no such file' }],
      }),
    });
    expect(report.exitCode).toBe(1);
    expect(report.lines.join('\n')).toContain('register.ts: no such file');
  });

  test('a CommonJS scan output fails validation with the same message as a load', async () => {
    const report = await validateMod({
      files,
      target: '.',
      compiler: answering({ scan: { code: CJS }, run: { code: CJS, format: 'cjs' }, issues: [] }),
    });
    expect(report.exitCode).toBe(1);
    expect(report.lines.join('\n')).toContain('the scan output is CommonJS, not an ES module');
  });
});

describe('a runtime that throws', () => {
  const runtimeThrowing = (thrown: unknown): ModRuntime => ({ load: () => Promise.reject(thrown) });

  test('a stack overflow is the documented reason for loading, whatever the engine called it', async () => {
    const report = await load({
      runtime: runtimeThrowing(new RangeError('Maximum call stack size exceeded.')),
    });
    expect(report.lines).toEqual([
      'first-mod: hooks module did not load: hooks/register.js: the engine ran out of stack loading the file (code nested too deep): Maximum call stack size exceeded.',
    ]);
  });

  test('any other throw is its message under the file name', async () => {
    const report = await load({ runtime: runtimeThrowing(new Error('boom at register.js:3')) });
    expect(report.lines).toEqual([
      'first-mod: hooks module did not load: hooks/register.js: boom at register.js:3',
    ]);
  });

  test('a runtime that reports linking has no message to add: the issue has the documented reason alone', () => {
    expect(engineStackIssue('link', 'helper.js', 'ignored').message).toBe(
      'helper.js: the engine ran out of stack linking the file and its imports',
    );
  });
});
