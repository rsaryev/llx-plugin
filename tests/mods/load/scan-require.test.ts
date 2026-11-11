/**
 * `require()` in a hooks module: a security deviation (docs/SECURITY.md, "`require()` in a hooks
 * module"; spec/judgments.md, `requireCall`). Claude Code 2.1.321, run as a black box
 * (`claude plugin validate` and a `--plugin-dir` load under `claude -p`), validates and loads a
 * module that calls `require()`, a locally declared `require` too; it refuses a dynamic `import()`
 * at validate and at load, as the kit does. The kit refuses every `require(` call: on Bun `require`
 * exists inside an ES module, so it would reach any file or package past the import rules.
 * Outside `spec(...)`: an oracle observation the kit departs from on purpose.
 */
import { describe, expect, test } from 'bun:test';
import { scanHooksModule } from '../../../src/mods/load/scan/index.ts';

const REFUSAL =
  'register.js: require() is not available; write every file as an ES module with import';
const problemsOf = (source: string): readonly string[] =>
  scanHooksModule(source, 'register.js', { isEntry: true }).issues.map((issue) => issue.message);

describe('require() is refused where Claude Code 2.1.321 loads it', () => {
  test('a require of a package or of a file outside the plugin', () => {
    for (const line of ["const fs = require('fs')", "const x = require('../../secret.js')"]) {
      expect(problemsOf(`${line}\nexport function register(on) {}`)).toContain(REFUSAL);
    }
  });

  test('a require inside a hook', () => {
    const source =
      "export function register(on) { on('tool.call', ($, e, next) => { require('child_process'); return next(e) }) }";
    expect(problemsOf(source)).toContain(REFUSAL);
  });

  test('a call of a function the module names require itself is refused too: the scan does not follow bindings', () => {
    const source = 'function require(x) { return x }\nrequire(1)\nexport function register(on) {}';
    expect(problemsOf(source)).toContain(REFUSAL);
  });

  test('a dynamic import() is refused, as Claude Code refuses it', () => {
    const source =
      "export function register(on) { on('tool.call', async ($, e, next) => { await import('./x.js'); return next(e) }) }";
    expect(problemsOf(source)).toEqual([
      'register.js: a dynamic import(); a hooks module imports its own files with an import declaration',
    ]);
  });
});
