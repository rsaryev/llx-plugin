/**
 * oracle 2.1.321 (spec/judgments.md, `clientProps`): what `claude plugin validate`, run as a black
 * box, says of a `Client` whose props are no object literal or name no `module`, written as a call
 * or as `h(Client, ...)`, what JSX compiles to (claude-code/index.d.ts:16450). The docs give only
 * the `module` prop. Each input below is a minimal module of the kit's own, as the oracle was run on.
 */
import { describe, expect, test } from 'bun:test';
import { scanHooksModule } from '../../../src/mods/load/scan/index.ts';

const moduleWith = (client: string): string => `import { Client, Box } from 'claude-code'
const props = { module: './x.js' }
export function register(on) {
  on('ui.render', { site: 'Pane' }, async ($, e) => Box({}, ${client}))
}`;

const messages = (client: string): string[] =>
  scanHooksModule(moduleWith(client), './register.js', {
    isEntry: true,
    directory: 'hooks',
  }).issues.map((issue) => issue.message);

const OBJECT =
  './register.js: Client takes its props as an object literal ({ module: "./board.tsx", key }), so the surface module it names can be read before it runs';
const NO_MODULE =
  './register.js: Client names no module: give it module, the surface module\'s path as a string literal ("./board.tsx")';

describe('the props of a Client', () => {
  test('props that are no object literal are refused, with what they are', () => {
    expect(messages('h(Client, props)')).toEqual([`${OBJECT} (got the variable props)`]);
    expect(messages('h(Client, null)')).toEqual([`${OBJECT} (got the literal null)`]);
    expect(messages("h(Client, 'x')")).toEqual([`${OBJECT} (got the literal 'x')`]);
    expect(messages('h(Client, make())')).toEqual([`${OBJECT} (got a call)`]);
    expect(messages('h(Client, e.props)')).toEqual([`${OBJECT} (got a member read)`]);
    expect(messages('h(Client)')).toEqual([`${OBJECT} (got no argument)`]);
    expect(messages('Client(props)')).toEqual([`${OBJECT} (got the variable props)`]);
    expect(messages('h(Client, `t`)')).toEqual([`${OBJECT} (got a template with a substitution)`]);
  });

  test('an object literal that names no module is refused; a spread or a computed key does not name it', () => {
    expect(messages("Client({ title: 'x' })")).toEqual([NO_MODULE]);
    expect(messages('h(Client, { ...e.props })')).toEqual([NO_MODULE]);
    expect(messages("h(Client, { ['module']: './x.js' })")).toEqual([NO_MODULE]);
    expect(messages("h(Client, { module: './x.js' }, h(Client, {}))")).toEqual([NO_MODULE]);
  });

  test('a module that is no literal says what it is', () => {
    const literal =
      "./register.js: Client module must be a string literal, the surface module's path relative to this file";
    expect(messages('h(Client, { module: `./a${1}` })')).toEqual([
      `${literal} (got a template with a substitution)`,
    ]);
    expect(messages('h(Client, { module: f() })')).toEqual([`${literal} (got a call)`]);
    expect(messages('h(Client, { module: e.m })')).toEqual([`${literal} (got a member read)`]);
    expect(messages('h(Client, { module: null })')).toEqual([`${literal} (got the literal null)`]);
  });

  test('a module beside a spread, or under a quoted key, is read', () => {
    expect(messages("h(Client, { ...e.props, module: './x.js' })")).toEqual([]);
    expect(messages("h(Client, { 'module': './x.js' })")).toEqual([]);
  });
});
