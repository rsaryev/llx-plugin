/**
 * plugins/mods/reference.md § Commands (`/reload-plugins`), plugins/mods/troubleshoot.md § `hooks module
 * did not load` (the version loaded before is unloaded) and plugins/mods/reference.md § Events
 * (`session.start`: "again after a reload of that mod").
 */
import { expect, test } from 'bun:test';
import { inline, modPlugin, session } from '../../support/mods-load.ts';
import { spec } from '../../support/spec.ts';

spec('mods.command./reload-plugins', () => {
  test('reloads plugins when you run it: the old module is unloaded, the new one loaded, and session.start fires again for it', async () => {
    let version = 'one';
    const starts: string[] = [];
    const make =
      (label: string) =>
      (on: (name: string, hook: () => unknown) => unknown): void => {
        on('session.start', () => {
          starts.push(label);
          return {};
        });
      };
    const { host } = session({
      'first-mod': (on) => make(version)(on as never),
    });
    const plugin = modPlugin(inline('first-mod'), make('x'));
    await host.load([plugin]);
    await host.fire('session.start', { surface: 'terminal' }, { only: 'first-mod' });
    version = 'two';
    const report = await host.reload();
    expect(report.loaded.map((mod) => mod.name)).toEqual(['first-mod']);
    await host.fire('session.start', { surface: 'terminal' }, { only: 'first-mod' });
    expect(starts).toEqual(['one', 'two']);
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
