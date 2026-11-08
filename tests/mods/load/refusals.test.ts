/**
 * plugins/mods/troubleshoot.md § Refusal messages (the six lines that follow `hooks module <name> not
 * loaded:`), § No installed plugin loads at all (`--safe-mode`), § No mod loads in a directory you opened
 * for the first time, plugins/mods/admin.md § Know which controls still apply, plugins/loading.md § Hooks
 * when two enabled plugins share a name. None has a requirement id of its own; the wording of the trust
 * line is ours (spec/judgments.md).
 */
import { expect, test } from 'bun:test';
import { activeModsLine, decideModLoad, orderMods } from '../../../src/mods/load/index.ts';
import {
  inline,
  installed,
  managed,
  modPlugin,
  organizations,
  policy,
  session,
} from '../../support/mods-load.ts';
import { spec } from '../../support/spec.ts';

const register = (on: unknown): void => void on;
const builtinMod = { ...installed('agents-md'), isBuiltin: true, id: 'agents-md@builtin' };

const SERVED_OFF =
  'hooks modules are turned off for installed plugins in this process: the rollout switch served off';
const SAVED_OFF =
  'hooks modules are turned off for installed plugins in this process: the rollout switch was saved off by an earlier session';

test('the rollout switch served off keeps every installed plugin out, the organization`s too, with the documented line', () => {
  const settings = policy({ managed: {}, rollout: 'served-off' });
  for (const candidate of [installed('a'), organizations('b')]) {
    expect(decideModLoad(settings, candidate)).toMatchObject({ load: false, reason: SERVED_OFF });
  }
});

test('a value an earlier session saved off reads as the documented second line', () => {
  expect(decideModLoad(policy({ rollout: 'saved-off' }), installed('a')).reason).toBe(SAVED_OFF);
});

test('the rollout switch leaves mods built into Claude Code alone', () => {
  expect(decideModLoad(policy({ rollout: 'served-off' }), builtinMod).load).toBe(true);
});

test('the host writes the rollout reason after `hooks module <id> not loaded:`', async () => {
  const { host } = session({ a: register }, { policy: policy({ rollout: 'served-off' }) });
  const report = await host.load([modPlugin(installed('a'), register)]);
  expect(report.lines).toEqual([`hooks module a@market not loaded: ${SERVED_OFF}`]);
  expect(report.loaded).toEqual([]);
});

test('--safe-mode turns installed mods off, the organization`s included, and not the built-in ones', () => {
  const withFlag = { ...managed({}), flags: { pluginDirs: [], safeMode: true } };
  for (const candidate of [installed('a'), organizations('b')]) {
    expect(decideModLoad(withFlag, candidate)).toMatchObject({
      load: false,
      reason: 'installed plugins load no hooks module in this mode (--safe-mode)',
    });
  }
  expect(decideModLoad(withFlag, builtinMod).load).toBe(true);
});

test('--bare keeps out the mods that are not managed: the line says so, and the organization`s keep running', () => {
  const settings = { ...managed({}), flags: { pluginDirs: [], bare: true } };
  expect(decideModLoad(settings, installed('a'))).toMatchObject({
    load: false,
    reason: 'installed plugins that are not managed load no hooks module in this mode (--bare)',
  });
  expect(decideModLoad(settings, organizations('b')).load).toBe(true);
  expect(decideModLoad(settings, builtinMod).load).toBe(true);
});

test('another plugin of that name loads first: the copy managed settings enable holds the name, the other is told so', () => {
  const copy = installed('acme-guard', 'elsewhere');
  const order = orderMods(managed({}), [copy, organizations('acme-guard')]);
  expect(order.ordered.map((mod) => mod.candidate.id)).toEqual([
    'sec-default@builtin',
    'acme-guard@acme-tools',
  ]);
  expect(order.skipped).toEqual([
    { candidate: copy, reason: 'another plugin of that name loads first' },
  ]);
});

test('with no managed copy the copy Claude Code loads first holds the name', async () => {
  const first = installed('same', 'one');
  const second = installed('same', 'two');
  const { host } = session({ same: register });
  const report = await host.load([modPlugin(first, register), modPlugin(second, register)]);
  expect(report.loaded.map((mod) => mod.id)).toEqual(['same@one']);
  expect(report.lines).toEqual([
    'hooks module same@two not loaded: another plugin of that name loads first',
  ]);
});

test('judgment: no mod loads until the trust prompt is answered, built-in mods excepted', async () => {
  const untrusted = policy({ isTrusted: false });
  for (const candidate of [installed('a'), organizations('b')]) {
    expect(decideModLoad(untrusted, candidate).load).toBe(false);
  }
  expect(decideModLoad(untrusted, builtinMod).load).toBe(true);
  const { host } = session({ a: register }, { policy: untrusted });
  const report = await host.load([modPlugin(installed('a'), register)]);
  expect(report.lines).toEqual([
    'hooks module a@market not loaded: the directory is not trusted yet: no mod loads until the trust prompt is answered',
  ]);
  // answered, or a session with no prompt: the same mod loads
  for (const trusted of [policy({ isTrusted: true }), policy()]) {
    const answered = session({ a: register }, { policy: trusted });
    const loaded = await answered.host.load([modPlugin(installed('a'), register)]);
    expect(loaded.loaded).toHaveLength(1);
  }
});

spec('mods.troubleshoot.Refusal messages.disableAllHooks in managed settings', () => {
  test('your organization turned off hooks from installed plugins: `disableAllHooks in managed settings`, for the organization`s own mods too', () => {
    const settings = managed({ disableAllHooks: true });
    for (const candidate of [installed('a'), organizations('b'), inline('c')]) {
      expect(decideModLoad(settings, candidate)).toMatchObject({
        load: false,
        reason: 'disableAllHooks in managed settings',
      });
    }
  });

  test('the debug log line is `hooks module first-mod@inline not loaded: disableAllHooks in managed settings`, as the page prints it for a mod loaded with --plugin-dir', async () => {
    const { host, debug } = session(
      { 'first-mod': register },
      { policy: managed({ disableAllHooks: true }) },
    );
    await host.load([modPlugin(inline('first-mod'), register)]);
    expect(debug).toContain(
      'hooks module first-mod@inline not loaded: disableAllHooks in managed settings',
    );
  });
});

spec('mods.troubleshoot.Refusal messages.another plugin of that name loads first', () => {
  test('another enabled plugin holds the name, so the hooks module does not load and the debug log says so', async () => {
    const holder = installed('same', 'one');
    const copy = installed('same', 'two');
    const { host, debug } = session({ same: register });
    const report = await host.load([modPlugin(holder, register), modPlugin(copy, register)]);
    expect(report.loaded.map((mod) => mod.id)).toEqual(['same@one']);
    expect(debug).toContain(
      'hooks module same@two not loaded: another plugin of that name loads first',
    );
  });

  test('a copy that managed settings enable holds the name against one the user installed', () => {
    const order = orderMods(managed({}), [
      installed('acme-guard', 'elsewhere'),
      organizations('acme-guard'),
    ]);
    expect(order.ordered.map((mod) => mod.candidate.id)).toContain('acme-guard@acme-tools');
    expect(order.skipped.map((skip) => skip.reason)).toEqual([
      'another plugin of that name loads first',
    ]);
  });
});

spec('mods.troubleshoot.No installed plugin loads at all', () => {
  test('--safe-mode: no installed plugin loads a hooks module, and without the flag it does', async () => {
    const safe = { ...policy(), flags: { pluginDirs: [], safeMode: true } };
    const withFlag = session({ a: register }, { policy: safe });
    const plugin = modPlugin(installed('a'), register);
    expect((await withFlag.host.load([plugin])).loaded).toEqual([]);
    const without = session({ a: register });
    expect((await without.host.load([plugin])).loaded).toHaveLength(1);
  });
});

spec('mods.troubleshoot.No mod loads in a directory you opened for the first time', () => {
  test('before the trust prompt is answered no mod loads; once it is accepted the same mods load', async () => {
    const plugins = [modPlugin(installed('a'), register), modPlugin(inline('b'), register)];
    const before = session({ a: register, b: register }, { policy: policy({ isTrusted: false }) });
    expect((await before.host.load(plugins)).loaded).toEqual([]);
    const accepted = session({ a: register, b: register }, { policy: policy({ isTrusted: true }) });
    expect((await accepted.host.load(plugins)).loaded.map((mod) => mod.name)).toEqual(['a', 'b']);
  });
});

spec(`mods.troubleshoot.The mods active line doesn't name the mod`, () => {
  test('a refused module is not on the line, and the debug log has the `hooks module ... not loaded:` line with the reason', async () => {
    const { host, debug } = session(
      { 'first-mod': register },
      { policy: policy({ managed: { allowManagedHooksOnly: true } }) },
    );
    await host.load([modPlugin(installed('first-mod'), register)]);
    expect(activeModsLine(host.active())).toBeUndefined();
    expect(debug).toEqual([
      'hooks module first-mod@market not loaded: only managed plugins and built-in plugins run',
    ]);
    expect(host.active().filter((mod) => !mod.isBuiltin)).toEqual([]);
  });

  test('the mods that did load are named, and the refused one is not', async () => {
    const { host, debug } = session(
      { accepted: register, refused: register },
      { policy: managed({ allowManagedHooksOnly: true }) },
    );
    const report = await host.load([
      modPlugin(organizations('accepted'), register),
      modPlugin(installed('refused'), register),
    ]);
    expect(report.loaded.map((mod) => mod.name)).toEqual(['cc-plugin-sec-default', 'accepted']);
    expect(debug).toContain(
      'hooks module refused@market not loaded: only managed plugins and built-in plugins run',
    );
    expect(activeModsLine(host.active())).toBe('1 mod active · accepted');
  });

  test('judgment: two mods that loaded are both named, and one turned off is not', async () => {
    const { host } = session({ a: register, b: register }, { policy: policy({ isTrusted: true }) });
    await host.load([modPlugin(installed('a'), register)]);
    await host.loadMod(modPlugin(installed('b'), register));
    expect(activeModsLine(host.active())).toBe('2 mods active · a, b');
    await host.unloadMod('b');
    expect(activeModsLine(host.active())).toBe('1 mod active · a');
  });
});
