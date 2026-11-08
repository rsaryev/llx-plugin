/**
 * plugins/mods/create.md § Sessions where a mod Claude writes can't load (no one to approve, an
 * untrusted workspace, mods disabled) and § Ask Claude for a mod (the approval, hot reloading);
 * plugins/mods/troubleshoot.md § Claude Code stops asking to enable hot reloading and § `This mod's
 * change didn't load` or `the earlier version is no longer running`; plugins/mods/admin.md § Choose
 * how much to allow (`disableSideloadFlags` keeps mods Claude writes from loading). Where the docs are
 * silent (what `Not now` does to a later question, the words of a refusal) the tests sit outside
 * `spec(...)` (spec/judgments.md).
 */
import { expect, test } from 'bun:test';
import {
  changeNotice,
  createHotReloadGate,
  writtenModRefusal,
} from '../../../src/mods/load/index.ts';
import { inline, modPlugin, policy, registerOf, session } from '../../support/mods-load.ts';
import { spec } from '../../support/spec.ts';

const interactive = { isInteractive: true } as const;

spec(`mods.create.Sessions where a mod Claude writes can't load.Nobody is there to approve`, () => {
  test('a `claude -p` run has no one to approve: the mod does not load', () => {
    expect(writtenModRefusal(policy(), { isInteractive: false })).toMatchObject({
      gate: 'no-approver',
    });
  });

  test('`dontAsk` mode cannot show a prompt either; the other modes can', () => {
    expect(
      writtenModRefusal(policy(), { ...interactive, permissionMode: 'dontAsk' }),
    ).toMatchObject({
      gate: 'no-approver',
    });
    for (const permissionMode of ['default', 'acceptEdits', 'plan'] as const) {
      expect(writtenModRefusal(policy(), { ...interactive, permissionMode })).toBeUndefined();
    }
  });
});

spec(
  `mods.create.Sessions where a mod Claude writes can't load.The workspace isn't trusted`,
  () => {
    test('before the trust prompt is accepted nothing Claude wrote loads, and after it the mod can', () => {
      expect(writtenModRefusal(policy({ isTrusted: false }), interactive)).toMatchObject({
        gate: 'untrusted',
      });
      expect(writtenModRefusal(policy({ isTrusted: true }), interactive)).toBeUndefined();
    });
  },
);

spec(`mods.create.Sessions where a mod Claude writes can't load.Mods are disabled`, () => {
  test('--safe-mode, --bare and disableAllHooks, in the user`s or the managed settings, disable them', () => {
    const off = [
      policy({ flags: { pluginDirs: [], safeMode: true } }),
      policy({ flags: { pluginDirs: [], bare: true } }),
      policy({ user: { disableAllHooks: true } }),
      policy({ managed: { disableAllHooks: true } }),
    ];
    for (const settings of off) {
      expect(writtenModRefusal(settings, interactive)).toMatchObject({ gate: 'disabled' });
    }
  });

  test('managed settings block it: disableSideloadFlags keeps mods Claude writes from loading', () => {
    expect(
      writtenModRefusal(policy({ managed: { disableSideloadFlags: true } }), interactive),
    ).toMatchObject({ gate: 'disabled' });
  });

  test('judgment: a session where managed settings allow only managed hooks or the guard allows only the organization`s mods refuses it too', () => {
    expect(
      writtenModRefusal(policy({ managed: { allowManagedHooksOnly: true } }), interactive),
    ).toMatchObject({ gate: 'disabled' });
    const guard = policy({
      managed: {
        pluginConfigs: {
          'cc-plugin-sec-default@builtin': { options: { allowManagedModsOnly: true } },
        },
      },
    });
    expect(writtenModRefusal(guard, interactive)).toMatchObject({ gate: 'disabled' });
  });
});

test('judgment: the first gate that closes names the reason; with several closed, no approver comes first, then trust, then the settings', () => {
  const closed = policy({ isTrusted: false, user: { disableAllHooks: true } });
  expect(writtenModRefusal(closed, { isInteractive: false })?.gate).toBe('no-approver');
  expect(writtenModRefusal(closed, interactive)?.gate).toBe('untrusted');
});

spec('mods.troubleshoot.Claude Code stops asking to enable hot reloading', () => {
  test('a question that ends three times without an answer picked leaves hot reloading off, and Claude Code asks no more', () => {
    const gate = createHotReloadGate();
    expect(gate.shouldAsk()).toBe(true);
    gate.answered('unanswered');
    gate.answered('unanswered');
    expect(gate.shouldAsk()).toBe(true);
    gate.answered('unanswered');
    expect(gate.shouldAsk()).toBe(false);
    expect(gate.enabled()).toBe(false);
  });

  test('a question you dismiss yourself does not count toward the three', () => {
    const gate = createHotReloadGate();
    for (let round = 0; round < 5; round += 1) gate.answered('dismissed');
    expect(gate.shouldAsk()).toBe(true);
    gate.answered('unanswered');
    gate.answered('unanswered');
    expect(gate.shouldAsk()).toBe(true);
  });

  test('an answer picked in between does not erase the count of unanswered ones', () => {
    const gate = createHotReloadGate();
    gate.answered('unanswered');
    gate.answered('unanswered');
    gate.answered('dismissed');
    gate.answered('unanswered');
    expect(gate.shouldAsk()).toBe(false);
  });

  test('the count lives in the state the host keeps: a gate made from it asks no more', () => {
    const first = createHotReloadGate();
    for (let round = 0; round < 3; round += 1) first.answered('unanswered');
    expect(createHotReloadGate(first.state()).shouldAsk()).toBe(false);
  });
});

// create.md § Ask Claude for a mod has no requirement id of its own, so these are documented behaviour
// outside `spec(...)` (no id is invented).
test('docs: `Enable for this session` turns hot reloading on and ends the question; your answer lasts for the session, including after you resume it', () => {
  const gate = createHotReloadGate();
  expect(gate.enabled()).toBe(false);
  gate.answered('enable');
  expect(gate.enabled()).toBe(true);
  expect(gate.shouldAsk()).toBe(false);
  const resumed = createHotReloadGate(gate.state());
  expect(resumed.enabled()).toBe(true);
  expect(resumed.shouldAsk()).toBe(false);
});

test('docs: `Not now` loads nothing for now', () => {
  const gate = createHotReloadGate();
  gate.answered('not-now');
  expect(gate.enabled()).toBe(false);
});

test('judgment: `Not now` ends the question for the session too, and a session resumed from its state does not ask again', () => {
  const gate = createHotReloadGate();
  gate.answered('not-now');
  expect(gate.shouldAsk()).toBe(false);
  const resumed = createHotReloadGate(gate.state());
  expect(resumed.shouldAsk()).toBe(false);
  expect(resumed.enabled()).toBe(false);
  expect(gate.state()).toEqual({ enabled: false, unanswered: 0, declined: true });
});

/** A mod whose module throws while `state.breaks` loads remain, and whose source text `state.source` the folder serves. */
function editable() {
  const state = {
    breaks: 0,
    message: 'the module threw while it loaded',
    source: 'export function register(on) {}',
  };
  const register = registerOf(() => {
    if (state.breaks > 0) {
      state.breaks -= 1;
      throw new Error(state.message);
    }
  });
  const base = modPlugin(inline('first-mod'), register);
  const plugin = {
    ...base,
    files: {
      ...base.files,
      readText: (path: string) =>
        path === 'hooks/register.js' ? Promise.resolve(state.source) : base.files.readText(path),
    },
  };
  return { state, plugin, ...session({ 'first-mod': register }) };
}

spec(
  `mods.troubleshoot.This mod's change didn't load or the earlier version is no longer running`,
  () => {
    test("a change that does not load while the earlier version still runs: `This mod's change didn't load, so the earlier version is still running: <reason>.`", async () => {
      const { host, plugin, state } = editable();
      await host.load([plugin]);
      state.source = 'export function register(on) { ';
      const outcome = await host.reloadMod('first-mod');
      expect(outcome?.mod).toBeDefined();
      const line = outcome ? changeNotice('first-mod', outcome) : undefined;
      expect(line).toBe(
        "first-mod: This mod's change didn't load, so the earlier version is still running: hooks module did not load: hooks/register.js: Unexpected token (1:31).",
      );
    });

    test("a change that leaves no version running: `This mod didn't load, and the earlier version is no longer running: <reason>.`", async () => {
      const { host, plugin, state } = editable();
      await host.load([plugin]);
      state.breaks = 2;
      const outcome = await host.reloadMod('first-mod');
      expect(outcome?.mod).toBeUndefined();
      expect(outcome ? changeNotice('first-mod', outcome) : undefined).toBe(
        "first-mod: This mod didn't load, and the earlier version is no longer running: hooks module did not load: hooks/register.js: the module threw while it loaded.",
      );
    });

    test('a reload that works says nothing of the kind', async () => {
      const { host, plugin } = editable();
      await host.load([plugin]);
      const outcome = await host.reloadMod('first-mod');
      expect(outcome ? changeNotice('first-mod', outcome) : 'no outcome').toBeUndefined();
    });

    test('the reason ends in one full stop, not two', async () => {
      const { host, plugin, state } = editable();
      await host.load([plugin]);
      state.breaks = 2;
      state.message = 'it ended with a stop.';
      const outcome = await host.reloadMod('first-mod');
      const line = outcome ? changeNotice('first-mod', outcome) : undefined;
      expect(line).toBe(
        "first-mod: This mod didn't load, and the earlier version is no longer running: hooks module did not load: hooks/register.js: it ended with a stop.",
      );
      expect(line).not.toEndWith('..');
    });
  },
);
