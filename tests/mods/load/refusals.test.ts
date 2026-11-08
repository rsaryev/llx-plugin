/**
 * plugins/mods/troubleshoot.md § Refusal messages (the six lines that follow `hooks module <name> not
 * loaded:`), § No installed plugin loads at all (`--safe-mode`), § No mod loads in a directory you opened
 * for the first time, plugins/mods/admin.md § Know which controls still apply, plugins/loading.md § Hooks
 * when two enabled plugins share a name. None has a requirement id of its own; the wording of the trust
 * line is ours (spec/judgments.md).
 */
import { expect, test } from 'bun:test';
import { decideModLoad, orderMods } from '../../../src/mods/load/index.ts';
import {
  installed,
  managed,
  modPlugin,
  organizations,
  policy,
  session,
} from '../../support/mods-load.ts';

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
