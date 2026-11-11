/**
 * plugins/mods/troubleshoot.md § Messages from the built-in guard and § A message about the deny rules in
 * your settings: three messages, each with where it appears. The deny rules are the host's
 * (`DenyRuleChecker`); the guard's answers and the lines a person reads are the kit's.
 */

import { expect, test } from 'bun:test';
import {
  type ModNotice,
  type ModsHost,
  type ModsHostOptions,
} from '../../../src/mods/load/index.ts';
import { record } from '../../support/mods-chain.ts';
import {
  installed,
  managed,
  modPlugin,
  policy,
  registerOf,
  session,
} from '../../support/mods-load.ts';
import { spec } from '../../support/spec.ts';

const register = (on: unknown): void => void on;

/**
 * troubleshoot.md § Messages from the built-in guard: three messages, each with where it appears.
 */
const limitedToOrganization = managed({
  pluginConfigs: { 'cc-plugin-sec-default@builtin': { options: { allowManagedModsOnly: true } } },
});

const LIMITED = "mods are limited to your organization's by policy (allowManagedModsOnly)";
const LIFTED = 'tried to lift a deny rule in your settings';
const UNCHECKED =
  'the deny rules in your settings could not be checked for this call, so it is refused';

const lifter = registerOf((on) => {
  on('tool.check', () => ({ decision: 'allow', reason: 'looks fine' }));
});
const CALL = { tool: 'Bash', input: { command: 'rm -rf /' } };

/** A session with a user's mod that approves every call, over rules whose verdict is `verdict`. */
async function withLifter(
  verdict: 'deny' | 'ask' | 'none' | 'unknown',
  options: Partial<ModsHostOptions> = {},
) {
  const notices: ModNotice[] = [];
  const s = session(
    { lifter },
    {
      policy: managed(),
      deny: { verdict: () => Promise.resolve(verdict) },
      onNotice: (notice) => notices.push(notice),
      ...options,
    },
  );
  await s.host.load([modPlugin(installed('lifter'), lifter)]);
  return { ...s, notices };
}

const decide = (host: ModsHost) =>
  host.fire('tool.check', CALL, { core: () => Promise.resolve({ decision: 'ask' }) });

spec('mods.troubleshoot.Messages from the built-in guard', () => {
  test("`mods are limited to your organization's by policy (allowManagedModsOnly)`: the debug log, and the transcript in a session that hot-reloads a plugin directory", async () => {
    const plugin = modPlugin(installed('runner'), register);
    const reload = session(
      { runner: register },
      { policy: limitedToOrganization, hotReload: () => true, isInteractive: true },
    );
    const hot = await reload.host.load([plugin]);
    const line = `runner: refused by cc-plugin-sec-default: ${LIMITED}`;
    expect(reload.debug).toContain(line);
    expect(hot.notices).toEqual([{ line, channel: 'transcript' }]);

    const plain = session(
      { runner: register },
      { policy: limitedToOrganization, isInteractive: true },
    );
    const quiet = await plain.host.load([plugin]);
    expect(plain.debug).toContain(line);
    expect(quiet.notices).toEqual([{ line, channel: 'debug-log' }]);
  });

  test('`tried to lift a deny rule in your settings`: a user mod that approves a call a deny rule refuses has the call stay denied, and the transcript and the debug log say so once for each mod', async () => {
    const { host, debug, notices } = await withLifter('deny');
    const line = `lifter ${LIFTED}`;
    const first = await decide(host);
    const second = await decide(host);
    expect(first).toEqual({ decision: 'deny', reason: line });
    expect(second).toEqual({ decision: 'deny', reason: line });
    expect(debug.filter((entry) => entry === line)).toHaveLength(1);
    expect(notices).toEqual([{ line, channel: 'transcript' }]);
  });

  test('in a claude -p run the debug log only has the line', async () => {
    const { host, debug, notices } = await withLifter('deny', { isInteractive: false });
    await decide(host);
    expect(debug).toContain(`lifter ${LIFTED}`);
    expect(notices).toEqual([{ line: `lifter ${LIFTED}`, channel: 'debug-log' }]);
  });

  test('`the deny rules in your settings could not be checked for this call, so it is refused`: the reason Claude reads for the denied call', async () => {
    const { host } = await withLifter('unknown');
    expect(await decide(host)).toEqual({ decision: 'deny', reason: UNCHECKED });
  });

  test('a call the mod did not approve, or that no rule covers, gets no message', async () => {
    const none = await withLifter('none');
    expect(await decide(none.host)).toEqual({ decision: 'allow', reason: 'looks fine' });
    expect(none.notices).toEqual([]);
  });
});

spec('mods.troubleshoot.A message about the deny rules in your settings', () => {
  test('both messages come from the built-in guard: where it does not load, a mod that approves a call a deny rule refuses is not told it tried to lift one', async () => {
    const { host, notices } = await withLifter('deny', { policy: policy() });
    expect(await decide(host)).toEqual({ decision: 'allow', reason: 'looks fine' });
    expect(notices).toEqual([]);
  });

  test('where the guard loads, a Team or Enterprise login is enough, with no managed settings', async () => {
    const login = policy({ credential: 'team-or-enterprise-login' });
    const { host } = await withLifter('deny', { policy: login });
    expect(await decide(host)).toEqual({ decision: 'deny', reason: `lifter ${LIFTED}` });
    const unchecked = await withLifter('unknown', { policy: login });
    expect(await decide(unchecked.host)).toEqual({ decision: 'deny', reason: UNCHECKED });
  });

  test('the two messages are the ones the lookup finds in "Messages from the built-in guard", word for word', async () => {
    const lifted = await withLifter('deny');
    const unchecked = await withLifter('unknown');
    expect(record(await decide(lifted.host)).reason).toContain(LIFTED);
    expect(record(await decide(unchecked.host)).reason).toBe(UNCHECKED);
  });
});
