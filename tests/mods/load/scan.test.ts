/**
 * plugins/mods/create.md § Check what Claude Code reads from your mod (the `hooks:`, `calls:`, `env`,
 * `state` and `gating` lines and the six rules after them), plugins/mods/interface.md § Define, read,
 * and write a value, plugins/mods/admin.md § Review what a mod can do, plugins/mods/reference.md §
 * Limits (scopes) and plugins/mods/troubleshoot.md § `code nested too deep to scan`.
 */
import { expect, test } from 'bun:test';
import { scanHooksModule } from '../../../src/mods/load/scan/index.ts';
import { spec } from '../../support/spec.ts';
import { callLabel, hookLabel } from '../../../src/mods/load/scan/uses.ts';

const FIRST_MOD = `
let calls = 0
export function register(on) {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'tally', description: 'Show how many tool calls Claude has made' })
    return next(e)
  })
  on('tool.call', async ($, e, next) => {
    calls += 1
    $.ui.invalidate('ui.render')
    return next(e)
  })
  on('command.run', { command: 'tally' }, async () => {
    return { text: 'Claude has made ' + calls + ' tool calls since this mod loaded' }
  })
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    return next({ ...e, props: { ...e.props, suffix: ' · tool calls: ' + calls + '…' } })
  })
}
`;

const messages = (source: string, options = {}): string[] =>
  scanHooksModule(source, 'register.js', { isEntry: true, ...options }).issues.map(
    (issue) => issue.message,
  );

spec(
  'mods.limit.Scopes, such as functions, blocks, and loops, nested inside one another in one file of a hooks module',
  () => {
    const nested = (levels: number): string =>
      `export function register(on) {}\nfunction f() ${'{'.repeat(levels)}${'}'.repeat(levels)}`;

    test('2,000 scopes nested in one file load; 2,001 do not, with the documented reason', () => {
      // `f` and its body are one scope, so 2,000 braces make 2,000 scopes.
      expect(messages(nested(2000))).toEqual([]);
      expect(messages(nested(2001))).toEqual([
        'register.js: code nested too deep to scan: more than 2000 scopes',
      ]);
    });

    test('functions and loops count as scopes, not only blocks', () => {
      const loops = `export function register(on) {}\n${'for (;;) '.repeat(2001)}{}`;
      expect(messages(loops)).toEqual([
        'register.js: code nested too deep to scan: more than 2000 scopes',
      ]);
      const functions = `export function register(on) {}\n${'function g() {'.repeat(2001)}${'}'.repeat(2001)}`;
      expect(messages(functions)).toEqual([
        'register.js: code nested too deep to scan: more than 2000 scopes',
      ]);
    });

    test('a function body is one scope with its function, a block inside it is the second', () => {
      const body = `export function register(on) {}\n${'function f() {'.repeat(1000)}${'}'.repeat(1000)}`;
      expect(messages(body)).toEqual([]);
    });
  },
);

test('the first-mod of the tutorial scans to the lines the docs print', () => {
  const scan = scanHooksModule(FIRST_MOD, 'register.js', { isEntry: true });
  expect(scan.issues).toEqual([]);
  expect(scan.hooks.map(hookLabel).join(', ')).toBe(
    'session.start, tool.call, command.run{command=tally}, ui.render{component=Spinner}',
  );
  expect(scan.calls.map(callLabel).join(', ')).toBe('$.command.register, $.ui.invalidate');
});

test('a call made through a top-level function reads `(via name)`; `$` passed elsewhere fails', () => {
  const source = `
async function loadNotes($) { return $.store.get('notes') }
export function register(on) {
  on('session.start', async ($, e, next) => { await loadNotes($); return next(e) })
}`;
  const scan = scanHooksModule(source, 'register.js', { isEntry: true });
  expect(scan.issues).toEqual([]);
  expect(scan.calls.map(callLabel)).toEqual(['$.store.get (via loadNotes)']);
  for (const passing of [
    "import { helper } from './helper.js'\nexport function register(on) { on('session.start', async ($, e, next) => { helper($); return next(e) }) }",
    "export function register(on) { on('session.start', async ($, e, next) => { const f = ($) => $.fs.read('x'); f($); return next(e) }) }",
    "export function register(on) { on('session.start', async ($, e, next) => { ({ f($) {} }).f($); return next(e) }) }",
  ]) {
    expect(messages(passing)).toHaveLength(1);
  }
});

test('assigning, destructuring or indexing `$` fails; `const ui = $.ui` is `$.ui is used as a value`', () => {
  const wrap = (body: string): string =>
    `export function register(on) { on('tool.call', async ($, e, next) => { ${body}; return next(e) }) }`;
  expect(messages(wrap('const ui = $.ui'))).toEqual(['register.js: $.ui is used as a value']);
  expect(messages(wrap('const { ui } = $'))).toEqual(['register.js: $ is used as a value']);
  expect(messages(wrap("$['ui'].log('x')"))).toHaveLength(1);
  expect(messages(wrap("const n = 'ui'; $[n].log('x')"))).toHaveLength(1);
  // the values of $.plugin are values, not calls
  expect(messages(wrap('const n = $.plugin.name'))).toEqual([]);
});

test('the event name is a string literal that names an event', () => {
  const on = (args: string): string => `export function register(on) { ${args} }`;
  expect(messages(on("on('tool.calls', async ($, e, next) => next(e))"))).toEqual([
    'register.js: "tool.calls" is not an event',
  ]);
  expect(messages(on("const name = 'tool.call'; on(name, async ($, e, next) => next(e))"))).toEqual(
    ['register.js: the event name passed to on() is not a string literal'],
  );
  expect(
    messages(on("for (const name of ['tool.call']) { on(name, async ($, e, next) => next(e)) }")),
  ).toEqual(['register.js: the event name passed to on() is not a string literal']);
  // a mods API call, a settings hook event and the wildcards are events too
  expect(
    messages(
      on(
        "on('fs.write', async ($, e, next) => next(e)); on('classic.Stop', async ($, e, next) => next(e)); on('*', async ($, e, next) => next(e))",
      ),
    ),
  ).toEqual([]);
});

test('`on` is not declared again inside register', () => {
  expect(messages('export function register(on) { { const on = 1 } }')).toEqual([
    'register.js: "on" is declared again (shadowed)',
  ]);
  expect(messages('export function register(on) { function go(on) {} }')).toEqual([
    'register.js: "on" is declared again (shadowed)',
  ]);
});

spec('mods.file.hooks/register.js', () => {
  test('imports only from files in the plugin by relative path, and `claude-code`; no import() and no require', () => {
    const head = (line: string): string => `${line}\nexport function register(on) {}`;
    expect(
      messages(head("import { atom } from 'claude-code'\nimport { f } from './f.js'")),
    ).toEqual([]);
    expect(messages(head("import fs from 'node:fs'"))[0]).toContain('imports "node:fs"');
    expect(messages(head("import x from 'left-pad'"))[0]).toContain('imports "left-pad"');
    expect(
      messages(
        "export function register(on) { on('tool.call', async ($, e, next) => { await import('./x.js'); return next(e) }) }",
      ),
    ).toEqual([
      'register.js: a dynamic import(); a hooks module imports its own files with an import declaration',
    ]);
    expect(messages(head("const fs = require('fs')"))[0]).toContain('require()');
    expect(
      scanHooksModule(head("import { f } from './f.js'\nimport g from '../g.js'"), 'hooks/a.js')
        .imports,
    ).toEqual(['./f.js', '../g.js']);
  });

  test('an import that leaves the plugin directory is refused, one that goes up and back down inside it is not', () => {
    const head = (line: string): string => `${line}\nexport function register(on) {}`;
    const from = (line: string, directory: string) =>
      scanHooksModule(head(line), 'hooks/register.js', { isEntry: true, directory });
    const outside = from("import x from '../../outside.js'", 'hooks');
    expect(outside.issues.map((issue) => issue.message)).toEqual([
      'hooks/register.js: imports "../../outside.js", outside the plugin directory: a hooks module imports only files inside the plugin directory, by relative path, and claude-code',
    ]);
    expect(outside.imports).toEqual([]);
    expect(from("import x from '../lib/x.js'", 'hooks').issues).toEqual([]);
    expect(from("import x from '../hooks/../lib/x.js'", 'hooks').issues).toEqual([]);
    expect(from("import x from '../x.js'", 'hooks/deep').issues).toEqual([]);
    expect(from("import x from '../../x.js'", 'hooks/deep').issues).toEqual([]);
    expect(from("import x from '../../../x.js'", 'hooks/deep').issues).not.toEqual([]);
  });
});

test('a hook with a .catch handler and a gating hook without one are told apart', () => {
  const source = `
async function guard($, e, next) { return next(e) }
export function register(on) {
  on('tool.call', { tool: 'Bash' }, guard).catch(async ($, e, next) => next(e))
  on('prompt.submit', async ($, e, next) => next(e))
  on('session.start', async ($, e, next) => next(e))
}`;
  const { hooks } = scanHooksModule(source, 'register.js', { isEntry: true });
  expect(hooks.map((hook) => [hookLabel(hook), hook.hasCatch, hook.isGating])).toEqual([
    ['tool.call{tool=Bash}', true, true],
    ['prompt.submit', false, true],
    ['session.start', false, false],
  ]);
});

test('the five gating events of events.md are config.set and plugin.register among them, and no other', () => {
  const hooked = (event: string): boolean => {
    const source = `export function register(on) { on('${event}', async ($, e, next) => next(e)) }`;
    return scanHooksModule(source, 'register.js', { isEntry: true }).hooks[0]?.isGating === true;
  };
  for (const event of [
    'tool.call',
    'tool.check',
    'prompt.submit',
    'config.set',
    'plugin.register',
  ]) {
    expect(hooked(event)).toBe(true);
  }
  for (const event of ['session.send', 'agent.spawn', 'session.start', 'turn.start']) {
    expect(hooked(event)).toBe(false);
  }
});

test('env reads and writes and state reads and writes are named; a computed name is marked', () => {
  const source = `
import { atom, read, update } from 'claude-code'
const count = atom({ plugin: 'hello-tabs', key: 'count' }, 0)
export function register(on) {
  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    const n = await read($, count)
    await update($, count, (v) => v + 1)
    $.env.get('HOME'); $.env.set('CI', '1'); $.env.get(name)
    $.state.get('tab'); $.state.set('tab', 'two')
    return next(e)
  })
}`;
  const scan = scanHooksModule(source, 'register.js', {
    isEntry: true,
    declaredState: new Set(['hello-tabs.count']),
  });
  expect(scan.issues).toEqual([]);
  expect(scan.envReads).toEqual(['HOME', '(computed)']);
  expect(scan.envWrites).toEqual(['CI']);
  expect(scan.stateReads).toEqual(['hello-tabs.count', 'tab']);
  expect(scan.stateWrites).toEqual(['hello-tabs.count', 'tab']);
});

test('an atom held in `let`, or not declared in the types file, fails', () => {
  const source = (keyword: string) => `
import { atom } from 'claude-code'
${keyword} count = atom({ plugin: 'hello-tabs', key: 'count' }, 0)
export function register(on) {}`;
  expect(messages(source('let'))[0]).toContain('takes a source the scan can read');
  expect(messages(source('const'), { declaredState: new Set() })).toEqual([
    'register.js: hello-tabs.count is not declared',
  ]);
  expect(messages(source('const'), { declaredState: new Set(['hello-tabs.count']) })).toEqual([]);
});

spec('mods.file.hooks/register.js', () => {
  test('a module with no register, or code that does not parse, is an issue, never a throw', () => {
    expect(messages('const x = 1')).toEqual([
      'register.js: no export named register (export function register(on, options) {...})',
    ]);
    expect(messages('export function register(on) {')[0]).toContain('register.js:');
    expect(scanHooksModule('export function register(on) {', 'a.js').hooks).toEqual([]);
  });
});

test('a telemetry hook without { to: "collector" } fails the scan', () => {
  const on = (args: string): string => `export function register(on) { ${args} }`;
  expect(messages(on("on('telemetry.log', async ($, e, next) => next(e))"))).toEqual([
    "register.js: telemetry.log needs the filter { to: 'collector' }",
  ]);
  expect(
    messages(on("on('telemetry.log', { to: 'collector' }, async ($, e, next) => next(e))")),
  ).toEqual([]);
});

test('the scan applies the chain\'s telemetry rule: any `to` that lets "collector" through passes, one that does not fails (judgment)', () => {
  const on = (matcher: string): string =>
    `export function register(on) { on('telemetry.log', ${matcher}, async ($, e, next) => next(e)) }`;
  for (const fits of [
    "{ to: 'collector', name: 'x' }",
    "{ to: ['a', 'collector'] }",
    '{ to: /^coll/ }',
  ]) {
    expect(messages(on(fits))).toEqual([]);
  }
  for (const misses of ["{ to: 'other' }", '{ to: someName }', "{ name: 'collector' }"]) {
    expect(messages(on(misses))).toEqual([
      "register.js: telemetry.log needs the filter { to: 'collector' }",
    ]);
  }
});
