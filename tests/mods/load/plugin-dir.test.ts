/**
 * plugins/mods/reference.md § Commands (`claude --plugin-dir <directory>`: "reloads its hooks module when you
 * save"), plugins/mods/create.md § Write a mod yourself (the hot reload), plugins/mods/troubleshoot.md §
 * Read the debug log (`reload failed, the previous version stays loaded:`).
 */
import { expect, test } from 'bun:test';
import { inline, modPlugin, policy, registerOf, session } from '../../support/mods-load.ts';
import { spec } from '../../support/spec.ts';

/** A mod whose hooks module is edited between loads: the folder serves `source`, `behaviour` is what `register` then does. */
function editable() {
  const source = `export function register(on) {
    on('session.start', async ($, e, next) => next(e))
    on('tool.call', async ($, e, next) => next(e))
  }`;
  const state = { source, version: 'v1', breaksOnce: false };
  const starts: string[] = [];
  const behaviour = registerOf((on) => {
    if (state.breaksOnce) {
      state.breaksOnce = false;
      throw new Error('the module threw while it loaded');
    }
    const answer = state.version;
    on('session.start', () => {
      starts.push(answer);
      return {};
    });
    on('tool.call', () => ({ result: answer }));
  });
  const base = modPlugin(inline('first-mod'), behaviour);
  const plugin = {
    ...base,
    files: {
      ...base.files,
      readText: (path: string) =>
        path === 'hooks/register.js' ? Promise.resolve(state.source) : base.files.readText(path),
    },
  };
  const s = session({ 'first-mod': behaviour });
  return {
    ...s,
    state,
    starts,
    plugin,
    fire: () => s.host.fire('tool.call', { tool: 'Bash' }),
  };
}

spec('mods.command.claude --plugin-dir <directory>', () => {
  const register = (on: unknown): void => void on;

  test('loads a plugin directory for one session: the flag names are loaded, repeating the flag loads several', async () => {
    const flags = policy({ flags: { pluginDirs: ['./first-mod', './second-mod'] } });
    const { host } = session({ 'first-mod': register, 'second-mod': register }, { policy: flags });
    expect(host.pluginDirs()).toEqual(['./first-mod', './second-mod']);
    const report = await host.load([
      modPlugin(inline('first-mod'), register),
      modPlugin(inline('second-mod'), register),
    ]);
    expect(report.loaded.map((mod) => mod.id)).toEqual(['first-mod@inline', 'second-mod@inline']);
  });

  test('reloads its hooks module when you save: register runs again, the new hooks answer, and session.start fires for it again', async () => {
    const mod = editable();
    await mod.host.load([mod.plugin]);
    expect(await mod.fire()).toEqual({ result: 'v1' });
    mod.state.version = 'v2';
    const outcome = await mod.host.reloadMod('first-mod');
    expect(outcome?.line).toBe('first-mod: reloaded; hooks: session.start,tool.call');
    expect(await mod.fire()).toEqual({ result: 'v2' });
    expect(mod.starts).toEqual(['v1', 'v2']);
    expect(mod.host.active().map((loaded) => loaded.name)).toEqual(['first-mod']);
    expect(mod.debug).toContain(outcome?.line ?? '');
  });

  test('a save that breaks the module keeps the version loaded before and says `reload failed, the previous version stays loaded:`', async () => {
    const mod = editable();
    await mod.host.load([mod.plugin]);
    mod.state.version = 'v2';
    mod.state.source = 'export function register(on) { ';
    const outcome = await mod.host.reloadMod('first-mod');
    expect(outcome?.line).toMatch(
      /^first-mod: reload failed, the previous version stays loaded: hooks module did not load: /,
    );
    expect(await mod.fire()).toEqual({ result: 'v1' });
    expect(mod.starts).toEqual(['v1']);
    expect(mod.host.active().map((loaded) => loaded.name)).toEqual(['first-mod']);
  });

  test('a module that parses but throws when it runs keeps the previous version too', async () => {
    const mod = editable();
    await mod.host.load([mod.plugin]);
    mod.state.version = 'v2';
    mod.state.breaksOnce = true;
    const outcome = await mod.host.reloadMod('first-mod');
    expect(outcome?.line).toContain('reload failed, the previous version stays loaded:');
    expect(outcome?.line).toContain('the module threw while it loaded');
    expect(await mod.fire()).toEqual({ result: 'v2' });
  });

  test('a mod the host does not know is not reloaded', async () => {
    const mod = editable();
    await mod.host.load([mod.plugin]);
    expect(await mod.host.reloadMod('other-mod')).toBeUndefined();
  });

  test('an interactive session watches a plugin directory; a non-interactive one only with CLAUDE_CODE_PLUGIN_DIR_WATCH=1', () => {
    const flags = { pluginDirs: ['./first-mod'] };
    expect(session({}, { policy: policy({ flags }) }).host.watchesPluginDirs(true)).toBe(true);
    expect(session({}, { policy: policy({ flags }) }).host.watchesPluginDirs(false)).toBe(false);
    const watched = policy({ flags, env: { CLAUDE_CODE_PLUGIN_DIR_WATCH: '1' } });
    expect(session({}, { policy: watched }).host.watchesPluginDirs(false)).toBe(true);
  });
});

spec(`mods.troubleshoot.Your edits don't take effect`, () => {
  test('develop with --plugin-dir pointed at your working copy: the session loads that directory, watches it, and an edit you save is what runs', async () => {
    const flags = policy({ flags: { pluginDirs: ['./first-mod'] } });
    const working = editable();
    const { host } = session({ 'first-mod': registerOf((on) => void on) }, { policy: flags });
    expect(host.pluginDirs()).toEqual(['./first-mod']);
    expect(host.watchesPluginDirs(true)).toBe(true);
    await working.host.load([working.plugin]);
    expect(await working.fire()).toEqual({ result: 'v1' });
    working.state.version = 'v2';
    await working.host.reloadMod('first-mod');
    expect(await working.fire()).toEqual({ result: 'v2' });
  });
});
