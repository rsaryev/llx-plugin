/**
 * plugins/mods/overview.md § How a mod works: a small mod has three files, `plugin.json`, `hooks.json`
 * and `register.js`, and the complete `register.js` of the page counts tool calls and shows the count
 * beside the spinner. The mod is loaded as a host loads it, from a folder of those three files.
 */
import { expect, test } from 'bun:test';
import { ESM_FORMAT } from '../../../src/mods/load/index.ts';
import type { ModCompiler } from '../../../src/mods/ports.ts';
import type { PluginFiles } from '../../../src/ports/index.ts';
import { inline, registerOf, session } from '../../support/mods-load.ts';
import { memoryFiles } from '../../support/ports.ts';
import { spec } from '../../support/spec.ts';

type Next = (e: unknown) => Promise<unknown>;
type Hook = (api: { ui: { invalidate(name: string): void } }, e: unknown, next: Next) => unknown;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * `register.js` of the page, the same code: the count is shared by the hooks, `tool.call` adds one and
 * asks for a redraw, the Spinner hook adds the count after the word.
 */
function firstMod(drawn: string[], registered: { times: number }) {
  return registerOf((on) => {
    registered.times += 1;
    let calls = 0;
    on('tool.call', (async ($, e, next) => {
      calls += 1;
      $.ui.invalidate('ui.render');
      drawn.push('invalidate');
      return next(e);
    }) satisfies Hook);
    on('ui.render', { component: 'Spinner' }, (async (_$, e, next) => {
      const props = isRecord(e) && isRecord(e.props) ? e.props : {};
      return next({
        ...(isRecord(e) ? e : {}),
        props: { ...props, suffix: ` · tool calls: ${calls}…` },
      });
    }) satisfies Hook);
  });
}

/** `hooks/register.js` as the page prints it: what the loader's scan reads. */
const REGISTER_JS = `// The count, shared by the two hooks below
let calls = 0

// Claude Code calls this once when the mod loads
export function register(on) {
  // Runs each time Claude is about to use a tool
  on('tool.call', async ($, e, next) => {
    calls += 1
    // Ask Claude Code to draw the interface again, so the new count shows
    $.ui.invalidate('ui.render')
    // Let the tool run as usual
    return next(e)
  })

  // Runs each time Claude Code draws the spinner
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    // Keep Claude Code's spinner, with the count added after its word
    return next({ ...e, props: { ...e.props, suffix: ' · tool calls: ' + calls + '…' } })
  })
}
`;

const manifest = JSON.stringify({ name: 'first-mod', version: '0.1.0' });

/** The three files of `first-mod/`; `hooks` is what `hooks/hooks.json` holds. */
const folder = (hooks: string, extra: Record<string, string> = {}): PluginFiles =>
  memoryFiles({
    '.claude-plugin/plugin.json': manifest,
    'hooks/hooks.json': hooks,
    'hooks/register.js': REGISTER_JS,
    ...extra,
  });

const SPINNER = {
  component: 'Spinner',
  surface: 'terminal',
  requestId: 'spinner',
  props: { word: 'Thinking' },
};
const engine = (e: unknown) => Promise.resolve({ type: 'engine', ref: e });

spec('mods.overview.How a mod works', () => {
  test('the page`s mod, from its three files: three tool calls give `Thinking · tool calls: 3…` beside the spinner', async () => {
    const drawn: string[] = [];
    const registered = { times: 0 };
    const { host } = session({ 'first-mod': firstMod(drawn, registered) });
    const report = await host.load([
      { candidate: inline('first-mod'), files: folder('{"modules":["./register.js"]}') },
    ]);
    expect(report.lines).toEqual([]);
    for (let call = 0; call < 3; call += 1) await host.fire('tool.call', { tool: 'Bash' });
    expect(drawn).toEqual(['invalidate', 'invalidate', 'invalidate']);
    const drawing = await host.fire('ui.render', SPINNER, { core: engine });
    expect(drawing).toEqual({
      type: 'engine',
      ref: { ...SPINNER, props: { word: 'Thinking', suffix: ' · tool calls: 3…' } },
    });
  });

  test('a hook runs only on its own event: another site is drawn as Claude Code draws it', async () => {
    const { host } = session({ 'first-mod': firstMod([], { times: 0 }) });
    await host.load([
      { candidate: inline('first-mod'), files: folder('{"modules":["./register.js"]}') },
    ]);
    const other = { ...SPINNER, component: 'Footer' };
    expect(await host.fire('ui.render', other, { core: engine })).toEqual({
      type: 'engine',
      ref: other,
    });
  });
});

spec('mods.overview.How a mod works.register.js', () => {
  test('`register` is called once when the mod loads, with `on`, and what it registers is what runs', async () => {
    const registered = { times: 0 };
    const { host } = session({ 'first-mod': firstMod([], registered) });
    const report = await host.load([
      { candidate: inline('first-mod'), files: folder('{"modules":["./register.js"]}') },
    ]);
    expect(registered.times).toBe(1);
    await host.fire('tool.call', { tool: 'Bash' });
    await host.fire('tool.call', { tool: 'Bash' });
    expect(registered.times).toBe(1);
    expect(report.loaded[0]?.uses.events).toEqual(['tool.call', 'ui.render{component=Spinner}']);
  });

  test('the file tells Claude Code which events: a module that registers nothing handles nothing', async () => {
    const nothing = registerOf(() => undefined);
    const { host } = session({ 'first-mod': nothing });
    await host.load([
      { candidate: inline('first-mod'), files: folder('{"modules":["./register.js"]}') },
    ]);
    expect(await host.fire('tool.call', { tool: 'Bash' })).toBeUndefined();
  });
});

spec('mods.overview.How a mod works.hooks.json', () => {
  /** A compiler that records which module it was asked for and hands that file's text back. */
  function recording(entries: string[]): ModCompiler {
    return {
      compile: async ({ files, entry }) => {
        entries.push(entry);
        const code = await files.readText(entry);
        return code === undefined
          ? { issues: [] }
          : { run: { code, format: ESM_FORMAT }, issues: [] };
      },
    };
  }

  test('points to the code file: the module `hooks.json` names is the one that loads, wherever it sits', async () => {
    const entries: string[] = [];
    const files = folder('{"modules":["./mods/main.js"]}', {
      'hooks/mods/main.js': 'export function register(on) {}',
    });
    const { host } = session(
      { 'first-mod': firstMod([], { times: 0 }) },
      { compiler: recording(entries) },
    );
    await host.load([{ candidate: inline('first-mod'), files }]);
    expect(entries).toEqual(['hooks/mods/main.js']);
  });

  test('with no `modules` key it points to nothing: no module loads and nothing is asked of the compiler', async () => {
    const entries: string[] = [];
    const registered = { times: 0 };
    const { host } = session(
      { 'first-mod': firstMod([], registered) },
      { compiler: recording(entries) },
    );
    const report = await host.load([{ candidate: inline('first-mod'), files: folder('{}') }]);
    expect(entries).toEqual([]);
    expect(registered.times).toBe(0);
    expect(report.loaded).toEqual([]);
  });
});

spec('mods.overview.How a mod works.plugin.json', () => {
  test('is the plugin`s manifest: one that is not valid keeps the module from loading, with the manifest`s own reason', async () => {
    const registered = { times: 0 };
    const { host } = session({ 'first-mod': firstMod([], registered) });
    const files = folder('{"modules":["./register.js"]}', {
      '.claude-plugin/plugin.json': JSON.stringify({ version: '0.1.0' }),
    });
    const report = await host.load([{ candidate: inline('first-mod'), files }]);
    expect(registered.times).toBe(0);
    expect(report.loaded).toEqual([]);
    expect(report.lines[0]).toStartWith('first-mod: hooks module did not load: ');
    expect(report.lines[0]).toContain('name');
  });

  test('a manifest that is valid lets the same module load', async () => {
    const { host } = session({ 'first-mod': firstMod([], { times: 0 }) });
    const report = await host.load([
      { candidate: inline('first-mod'), files: folder('{"modules":["./register.js"]}') },
    ]);
    expect(report.loaded.map((mod) => mod.name)).toEqual(['first-mod']);
  });
});
