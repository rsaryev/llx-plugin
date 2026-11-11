/**
 * What the kit decides about the troubleshoot.md entries for a hooks module that does not load
 * (spec/judgments.md): the page gives words and not who raises them, so these are tested outside
 * `spec(...)` and count for no requirement.
 */
import { describe, expect, test } from 'bun:test';
import { spec } from '../../support/spec.ts';
import { engineStackIssue } from '../../../src/mods/load/engine-faults.ts';
import type { ModPlugin } from '../../../src/mods/load/index.ts';
import type { ModRuntime } from '../../../src/mods/ports.ts';
import { inline, modPlugin, registerOf, session } from '../../support/mods-load.ts';
import { memoryFiles } from '../../support/ports.ts';

const noop = registerOf(() => undefined);

spec('mods.troubleshoot.the engine ran out of stack linking the file and its imports', () => {
  // Nothing in the kit detects linking: a host's runtime returns the issue, and the kit owns the words.
  test('a runtime that returns the linking issue gives the line with the mod, the file and the documented reason, and the mod does not load', async () => {
    const runtime: ModRuntime = {
      load: () => Promise.resolve({ issues: [engineStackIssue('link', 'hooks/deep.js', '')] }),
    };
    const { host } = session({ 'first-mod': noop }, { runtime });
    const report = await host.load([modPlugin(inline('first-mod'), noop)]);
    expect(report.loaded).toEqual([]);
    expect(report.lines).toEqual([
      'first-mod: hooks module did not load: hooks/deep.js: the engine ran out of stack linking the file and its imports',
    ]);
    expect(host.active()).toEqual([]);
  });
});

describe('the linking reason (a judgment)', () => {
  test('the reason is the same whatever the engine says: it names no message and no line', () => {
    expect(engineStackIssue('link', 'a.js', 'Maximum call stack size exceeded.').message).toBe(
      engineStackIssue('link', 'a.js', 'RangeError at 1:2').message,
    );
  });
});

describe('an engine that throws', () => {
  const loadThrowing = async (thrown: unknown) => {
    const runtime: ModRuntime = { load: () => Promise.reject(thrown) };
    const { host } = session({ 'first-mod': noop }, { runtime });
    return host.load([modPlugin(inline('first-mod'), noop)]);
  };

  test('an ordinary error that only mentions a stack is its message, not the ran out of stack reason', async () => {
    const report = await loadThrowing(new Error('stack is empty'));
    expect(report.lines).toEqual([
      'first-mod: hooks module did not load: hooks/register.js: stack is empty',
    ]);
  });

  test('a stack overflow in the words of V8, Firefox and Safari is the documented reason', async () => {
    for (const message of [
      'Maximum call stack size exceeded',
      'too much recursion',
      'Stack overflow',
      'Not enough stack space to parse input',
    ]) {
      const [line] = (await loadThrowing(new Error(message))).lines;
      expect(line).toContain('the engine ran out of stack loading the file (code nested too deep)');
    }
  });
});

describe('a hooks.json whose `modules` key is misspelled', () => {
  test('a session loads nothing from it: no module, and no line saying why', async () => {
    const { host } = session({ 'first-mod': noop });
    const plugin: ModPlugin = {
      candidate: inline('first-mod'),
      files: memoryFiles({
        '.claude-plugin/plugin.json': JSON.stringify({ name: 'first-mod', version: '0.1.0' }),
        'hooks/hooks.json': JSON.stringify({ module: ['./register.js'] }),
      }),
    };
    const report = await host.load([plugin]);
    expect(report.loaded).toEqual([]);
    expect(report.lines).toEqual([]);
  });
});
