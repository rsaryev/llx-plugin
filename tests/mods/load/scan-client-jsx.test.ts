/**
 * A `<Client module>` written in JSX: JSX compiles against the global `h`, "classic runtime, `@jsx
 * h`", to "bare `h(...)` calls resolved by name", and "a `<Client>` tag written under another factory
 * is not found when the module's surface modules are read off its source" (claude-code/index.d.ts:16450).
 * So `<Client key="a" module="./x.js" />` is read as `h(Client, { key: 'a', module: './x.js' })`, the
 * same as `Client({ ... })`, spans included; the rules on the literal are the same.
 */
import { describe, expect, test } from 'bun:test';
import { scanHooksModule } from '../../../src/mods/load/scan/index.ts';

const moduleWith = (draw: string): string => `export function register(on) {
  on('ui.render', { site: 'Pane' }, async ($, e) => {
    const { Box, Client } = $.ui.resolve(e)
    return ${draw}
  })
}`;

const scan = (draw: string) =>
  scanHooksModule(moduleWith(draw), './register.js', { isEntry: true, directory: 'hooks' });

describe('a Client compiled from JSX', () => {
  test('h(Client, { module }) names a surface module, with its span', () => {
    const draw = "h(Box, null, h(Client, { key: 'a', module: '../client/spinner.js' }))";
    const scanned = scan(draw);
    expect(scanned.surfaceModules).toEqual(['client/spinner.js']);
    expect(scanned.issues).toEqual([]);
    const [span] = scanned.surfaceModuleSpans;
    expect(moduleWith(draw).slice(span?.start, span?.end)).toBe("'../client/spinner.js'");
  });

  test('both forms in one module are read in source order, each module once', () => {
    const draw =
      "h(Box, null, Client({ key: 'a', module: './a.js' }), h(Client, { key: 'b', module: './b.js' }), h(Client, { key: 'c', module: './a.js' }))";
    const scanned = scan(draw);
    expect(scanned.surfaceModules).toEqual(['hooks/a.js', 'hooks/b.js']);
    expect(scanned.surfaceModuleSpans.map((one) => one.module)).toEqual([
      'hooks/a.js',
      'hooks/b.js',
      'hooks/a.js',
    ]);
  });

  test('the same rules hold: a variable is refused', () => {
    const scanned = scan("h(Client, { key: 'a', module: chosen })");
    expect(scanned.issues.map((issue) => issue.message)).toEqual([
      "./register.js: Client module must be a string literal, the surface module's path relative to this file (got the variable chosen)",
    ]);
  });

  test('another factory, a string tag or props that are not an object are no Client', () => {
    const none = [
      "React.createElement(Client, { module: './x.js' })",
      "jsx(Client, { module: './x.js' })",
      "h('Client', { module: './x.js' })",
      "h(Client, null, './x.js')",
    ];
    for (const draw of none) expect(scan(draw).surfaceModules).toEqual([]);
  });
});
