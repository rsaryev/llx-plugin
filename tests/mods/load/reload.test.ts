/**
 * plugins/mods/reference.md § Commands (`/reload-plugins`), plugins/mods/troubleshoot.md § `hooks module
 * did not load` (the version loaded before is unloaded) and plugins/mods/reference.md § Events
 * (`session.start`: "again after a reload of that mod").
 */
import { expect, test } from 'bun:test';
import { inline, modPlugin, registerOf, session } from '../../support/mods-load.ts';
import { spec } from '../../support/spec.ts';

spec('mods.command./reload-plugins', () => {
  test('reloads plugins when you run it: the old module is unloaded, the new one loaded, and the host fires session.start for it again with no manual fire', async () => {
    let version = 'one';
    const starts: string[] = [];
    const make = (label: string) =>
      registerOf((on) => {
        on('session.start', () => {
          starts.push(label);
          return {};
        });
      });
    const { host } = session({
      'first-mod': (on, options) => make(version)(on, options),
    });
    const plugin = modPlugin(inline('first-mod'), make('x'));
    await host.load([plugin]);
    expect(starts).toEqual(['one']);
    version = 'two';
    const report = await host.reload();
    expect(report.loaded.map((mod) => mod.name)).toEqual(['first-mod']);
    expect(starts).toEqual(['one', 'two']);
  });

  test('session.start reaches each loaded mod once, with the surface, whether it is interactive and the directory', async () => {
    const seen: unknown[] = [];
    const watch = registerOf((on) => {
      on('session.start', (_$: unknown, e: unknown) => {
        seen.push(e);
        return e;
      });
    });
    const { host } = session({ 'first-mod': watch, 'second-mod': watch });
    await host.load([
      modPlugin(inline('first-mod'), watch),
      modPlugin(inline('second-mod'), watch),
    ]);
    expect(seen).toEqual([
      { surface: 'terminal', isInteractive: true, cwd: '/work' },
      { surface: 'terminal', isInteractive: true, cwd: '/work' },
    ]);
  });

  test('a mod built into Claude Code is unaffected: it still runs and shows in active() after a reload', async () => {
    const { host } = session({ a: (on) => void on });
    await host.registerBuiltIn('native', 'builtin', [
      {
        event: 'tool.call',
        isGenerator: false,
        run: () => ({ result: 'native' }),
      },
    ]);
    await host.load([modPlugin(inline('a'), (on) => void on)]);
    expect(host.active().map((mod) => mod.name)).toEqual(['native', 'a']);
    await host.reload();
    expect(host.active().map((mod) => mod.name)).toEqual(['native', 'a']);
    expect(await host.fire('tool.call', { tool: 'Bash' })).toEqual({ result: 'native' });
  });

  test('a module that no longer loads is unloaded and the line says so (troubleshoot.md: "the version loaded before is unloaded")', async () => {
    const good = (on: unknown): void => void on;
    let source = 'export function register(on) {}';
    const files = {
      ...modPlugin(inline('first-mod'), good).files,
      readText: (path: string) =>
        path === 'hooks/register.js'
          ? Promise.resolve(source)
          : modPlugin(inline('first-mod'), good).files.readText(path),
    };
    const { host } = session({ 'first-mod': good });
    await host.load([{ candidate: inline('first-mod'), files }]);
    source = 'export function register(on) { ';
    const report = await host.reload();
    expect(report.loaded).toEqual([]);
    expect(report.lines).toHaveLength(1);
    expect(report.lines[0]).toMatch(
      /^first-mod: hooks module did not load: .*; the version loaded before is unloaded$/,
    );
  });
});
