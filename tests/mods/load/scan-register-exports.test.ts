/**
 * The entry exports `register`: "Claude Code calls the `register` function the file exports"
 * (plugins/mods/create.md, "Write the hooks module"), and a hooks module is `{ register: Register }`
 * (claude-code/index.d.ts:5480). Any ES form that exports a top-level function of the file under
 * the name `register` is that export: a declaration (`export function`, `export const`) or a list
 * (`export { register }`, `export { draw as register }`, `export { draw as 'register' }`), which
 * is what a bundler emits, before or after the function. The scan follows the function it names.
 * Which functions count, and the message for each form that does not, are oracle 2.1.321
 * (`claude plugin validate` and `claude -p` of the same modules as a black box; spec/judgments.md,
 * `registerExport`): a function declaration or a `const` function; Claude Code loads no other.
 */
import { describe, expect, test } from 'bun:test';
import { scanHooksModule } from '../../../src/mods/load/scan/index.ts';

const body = "(on) => { on('tool.call', ($, e, next) => next(e)) }";
const scan = (source: string) => scanHooksModule(source, 'register.js', { isEntry: true });
const reads = (source: string) => {
  const scanned = scan(source);
  return { hasRegister: scanned.hasRegister, hooks: scanned.hooks.length, issues: scanned.issues };
};
const READ = { hasRegister: true, hooks: 1, issues: [] };

describe('the forms that export register', () => {
  test('a declaration, as before', () => {
    expect(reads(`export const register = ${body}`)).toEqual(READ);
    expect(
      reads(`export function register(on) { on('tool.call', ($, e, next) => next(e)) }`),
    ).toEqual(READ);
  });

  test('an export list naming the function, after it or before it', () => {
    expect(reads(`const register = ${body}\nexport { register }`)).toEqual(READ);
    expect(reads(`export { register }\nconst register = ${body}`)).toEqual(READ);
    expect(
      reads(
        `function register(on) { on('tool.call', ($, e, next) => next(e)) }\nexport { register }`,
      ),
    ).toEqual(READ);
  });

  test('a function of another name exported as register, by name or string', () => {
    expect(reads(`const draw = ${body}\nexport { draw as register }`)).toEqual(READ);
    expect(reads(`const draw = ${body}\nexport { draw as 'register' }`)).toEqual(READ);
    expect(reads(`function draw(on) {}\nexport { draw as register }`).hasRegister).toBe(true);
  });

  test('a let, var or class register, or a list naming no const function, is refused', () => {
    const messages = (source: string) => scan(source).issues.map((issue) => issue.message);
    const notConst = ['register.js: register is exported as something other than a const function'];
    expect(messages(`export let register = ${body}`)).toEqual(notConst);
    expect(messages(`export var register = ${body}`)).toEqual(notConst);
    expect(messages('export const register = 42')).toEqual(notConst);
    expect(messages('export class register {}')).toEqual([
      'register.js: register is exported as something other than a function declared at the top of this file',
    ]);
    expect(messages(`var draw = ${body}\nexport { draw as 'register' }`)).toEqual([
      'register.js: register is exported as "draw", which is not a function declared at the top of this file',
    ]);
    expect(messages(`let register = ${body}\nexport { register }`)).toEqual([
      'register.js: register is exported as "register", which is not a function declared at the top of this file',
    ]);
    expect(messages("import { register } from './impl.js'\nexport { register }")).toEqual([
      'register.js: register is exported as "register", which is not a function declared at the top of this file',
    ]);
  });

  test('register re-exported from another file is refused, by name or through export *', () => {
    const messages = (source: string) => scan(source).issues.map((issue) => issue.message);
    expect(messages("export { register } from './impl.js'")).toEqual([
      'register.js: register is re-exported from another file',
    ]);
    expect(messages("export { start as register } from './impl.js'")).toEqual([
      'register.js: register is re-exported from another file',
    ]);
    const star = [
      'register.js: register is not exported here by name; what `export *` re-exports from another file is not followed',
    ];
    expect(messages("export * from './impl.js'")).toEqual(star);
    expect(messages("export * as register from './impl.js'")).toEqual(star);
    expect(messages(`export * from './impl.js'\nexport function register(on) {}`)).toEqual([]);
  });

  test('register exported under another name, or not at all, is no entry', () => {
    const missing = [
      'register.js: no export named register (export function register(on, options) {...})',
    ];
    const messages = (source: string) => scan(source).issues.map((issue) => issue.message);
    expect(messages(`const register = ${body}\nexport { register as start }`)).toEqual(missing);
    expect(messages(`const register = ${body}`)).toEqual(missing);
    expect(messages(`const register = ${body}\nexport { register as default }`)).toEqual(missing);
  });
});
