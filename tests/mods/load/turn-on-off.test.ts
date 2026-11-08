/**
 * plugins/mods/overview.md § Turn mods on or off: mods are on by default; `--safe-mode` stops every
 * installed mod for one session; `"disableAllHooks": true` in the user's settings stops them in every
 * session while what the organization manages keeps running; `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS` is
 * ignored. Turning one mod off is `unloadMod` (per-mod.test.ts).
 */
import { expect, test } from 'bun:test';
import { decideModLoad } from '../../../src/mods/load/index.ts';
import {
  inline,
  installed,
  managed,
  modPlugin,
  organizations,
  policy,
  registerOf,
  session,
} from '../../support/mods-load.ts';
import { spec } from '../../support/spec.ts';

const builtin = { ...installed('agents-md'), isBuiltin: true, id: 'agents-md@builtin' };
const answer = registerOf((on) => {
  on('tool.call', () => ({ result: 'ran' }));
});

spec('mods.overview.Turn mods on or off', () => {
  test('mods are on by default: an installed plugin`s hooks module loads and its hooks run', async () => {
    expect(decideModLoad(policy(), installed('a')).load).toBe(true);
    const { host } = session({ a: answer });
    await host.load([modPlugin(installed('a'), answer)]);
    expect(await host.fire('tool.call', { tool: 'Bash' })).toEqual({ result: 'ran' });
  });

  test('`disableAllHooks` in your settings stops every installed mod in every session, and what your organization manages keeps running', async () => {
    const settings = managed({ prependPlugins: ['acme@acme-tools'] });
    const off = { ...settings, user: { disableAllHooks: true } };
    expect(decideModLoad(off, installed('a')).load).toBe(false);
    expect(decideModLoad(off, organizations('acme')).load).toBe(true);
    const { host } = session({ a: answer, acme: answer }, { policy: off });
    const report = await host.load([
      modPlugin(installed('a'), answer),
      modPlugin(organizations('acme'), answer),
    ]);
    expect(report.loaded.filter((mod) => !mod.isBuiltin).map((mod) => mod.name)).toEqual(['acme']);
    expect(report.lines).toEqual([
      'hooks module a@market not loaded: only managed plugins and built-in plugins run',
    ]);
  });

  test('mods built into Claude Code are not stopped by it, nor by `--safe-mode`', () => {
    const settings = {
      ...policy({ user: { disableAllHooks: true } }),
      flags: { pluginDirs: [], safeMode: true },
    };
    expect(decideModLoad(settings, builtin).load).toBe(true);
  });

  test('`CLAUDE_CODE_ENABLE_FUNCTION_HOOKS` from early access is ignored: setting it to 0 does not keep mods off', async () => {
    for (const value of ['0', '1', 'false']) {
      const settings = policy({ env: { CLAUDE_CODE_ENABLE_FUNCTION_HOOKS: value } });
      expect(decideModLoad(settings, installed('a')).load).toBe(true);
    }
    const { host } = session(
      { a: answer },
      { policy: policy({ env: { CLAUDE_CODE_ENABLE_FUNCTION_HOOKS: '0' } }) },
    );
    expect((await host.load([modPlugin(installed('a'), answer)])).loaded).toHaveLength(1);
  });

  test('a mod loaded with --plugin-dir is an installed one to the setting: `disableAllHooks` stops it too', () => {
    expect(decideModLoad(policy({ user: { disableAllHooks: true } }), inline('a')).load).toBe(
      false,
    );
  });
});

spec('mods.overview.Turn mods on or off.Every installed mod, for one session', () => {
  const safe = { ...policy(), flags: { pluginDirs: [], safeMode: true } };

  test('`--safe-mode` stops every installed mod for the session', async () => {
    for (const candidate of [installed('a'), inline('b'), organizations('c')]) {
      expect(decideModLoad(safe, candidate).load).toBe(false);
    }
    const { host } = session({ a: answer }, { policy: safe });
    const report = await host.load([modPlugin(installed('a'), answer)]);
    expect(report.loaded).toEqual([]);
    expect(await host.fire('tool.call', { tool: 'Bash' })).toBeUndefined();
  });
});
