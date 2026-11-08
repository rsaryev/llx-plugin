/**
 * Where the docs are silent about reading and answering a call, a prompt, a settings read or a stopped
 * turn (spec/judgments.md); none of this counts as compatibility, so none of it is under `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import {
  inputChangedDenial,
  promptDroppedText,
  toolReadOnlyReport,
  unansweredCommandReply,
  withheldResultText,
} from '../../../src/mods/events/index.ts';
import { settingsLayersForMods } from '../../../src/mods/api/index.ts';
import type { PolicyLayer } from '../../../src/settings/index.ts';
import { fakePorts } from '../../../src/testing/mods/index.ts';
import { fn } from '../../support/mods-chain.ts';
import { apiHarness } from '../../support/mods-api.ts';
import { inline, modPlugin, registerOf, session } from '../../support/mods-load.ts';
import { runPluginTests } from '../../support/mods-testing.ts';

describe('what Claude reads of a call that was withheld', () => {
  test('a call that never ran, or one that failed, gives Claude the reason alone', () => {
    expect(withheldResultText({ tool: 'Bash', reason: 'No.', ran: 'not-run' })).toBe('No.');
    expect(withheldResultText({ tool: 'Bash', reason: 'No.', ran: 'failed' })).toBe('No.');
  });

  test('the prompt line keeps the reason as the hook wrote it', () => {
    expect(promptDroppedText('Use /clear first.')).toBe(
      'Prompt dropped by a hook: Use /clear first.',
    );
  });
});

describe('which tools report a call as read-only', () => {
  const checks = { bashCommand: () => true, mcpReadOnlyHint: () => undefined };

  test('a tool the docs do not list as reporting read-only leaves the field absent, whatever its name suggests', () => {
    for (const tool of ['Edit', 'Write', 'NotebookEdit', 'PowerShell', 'Monitor', 'ReadFile']) {
      expect(toolReadOnlyReport({ tool, input: {} }, checks)).toBeUndefined();
    }
  });

  test('an MCP tool with no readOnlyHint leaves it absent, and a hint that is not true does too', () => {
    expect(toolReadOnlyReport({ tool: 'mcp__a__b', input: {} }, checks)).toBeUndefined();
    const no = { ...checks, mcpReadOnlyHint: () => false };
    expect(toolReadOnlyReport({ tool: 'mcp__a__b', input: {} }, no)).toBeUndefined();
  });

  test('a Bash call without a command string is not read-only', () => {
    expect(toolReadOnlyReport({ tool: 'Bash', input: { command: 7 } }, checks)).toBeUndefined();
  });
});

describe('the words the kit adds to a quoted message', () => {
  test('the reply for a command no hook answered ends with an instruction naming the command', () => {
    expect(unansweredCommandReply('first-mod', 'tally')).toBe(
      'first-mod registered /tally but no command.run hook answered it. Add a command.run hook for /tally that returns { text }.',
    );
  });

  test('the denial of a changed input ends with the instruction to issue the call once more as recorded', () => {
    const denial = inputChangedDenial({
      mode: 'auto',
      written: { a: 1 },
      passed: { a: 2 },
      review: 'server',
    });
    expect(denial?.reason).toBe(
      "a hook changed this call's input after the model wrote it; issue the call once more exactly as recorded",
    );
  });
});

describe('the sources of e.layers', () => {
  test('a source that holds no settings is not listed, and neither is a source the six names leave out', () => {
    const given: PolicyLayer[] = [
      { scope: 'user', settings: {} },
      { scope: 'project', settings: { model: 'sonnet' } },
      { scope: 'addDir', settings: { enabledPlugins: {} } },
      { scope: 'parent', settings: { model: 'x' } },
    ];
    expect(settingsLayersForMods(given)).toEqual([
      { source: 'project', settings: { model: 'sonnet' } },
    ]);
    expect(settingsLayersForMods([], [{}])).toEqual([]);
  });
});

describe('a settings.read answer', () => {
  const settings = {
    layers: () => Promise.resolve([{ source: 'user', settings: { model: 'haiku' } }]),
    merged: () => ({ model: 'haiku' }),
  };

  test('a value that is an array gives a key no value, so a call with a key resolves to undefined', async () => {
    const h = await apiHarness({ ports: { settings } });
    await h.mod('stub', 'prepend', [fn('settings.read', () => ({ value: ['model', 'opus'] }))]);
    expect(await h.api.settings.read()).toEqual(['model', 'opus']);
    expect(await h.api.settings.read({ key: 'model' })).toBeUndefined();
  });

  test('anything but { value } or a string { deny } fails the hook: it is skipped and the read stands', async () => {
    const h = await apiHarness({ ports: { settings } });
    await h.mod('stub', 'prepend', [fn('settings.read', () => 'nothing')]);
    expect(await h.api.settings.read()).toEqual({ model: 'haiku' });
    expect(h.reports.map((report) => report.line)).toEqual([
      'stub: settings.read hook skipped: returned the wrong shape (settings.read result: returned neither { value } nor { deny })',
    ]);
    const deny = await apiHarness({ ports: { settings } });
    await deny.mod('stub', 'prepend', [fn('settings.read', () => ({ deny: 5 }))]);
    await deny.api.settings.read();
    expect(deny.reports).toHaveLength(1);
  });

  test('the test kit fires settings.read with empty layers unless the test gives some', async () => {
    const seen: unknown[] = [];
    const watcher = registerOf((on) => {
      on('settings.read', (_$: unknown, e: unknown, next: (e: unknown) => unknown) => {
        seen.push(e);
        return next(e);
      });
    });
    await runPluginTests({
      name: 'watcher',
      register: watcher,
      tests: {
        'tests/watcher.test.ts': ({ test: declare }) => {
          declare('reads', async (claude, on) => {
            on('settings.read', () => ({ value: {} }));
            await claude['settings']?.['read']?.({});
            await claude['settings']?.['read']?.({ layers: [{ source: 'user', settings: {} }] });
          });
        },
      },
    });
    expect(seen).toEqual([{ layers: [] }, { layers: [{ source: 'user', settings: {} }] }]);
  });
});

describe('the toast of a stopped turn', () => {
  const resumer = registerOf((on) => {
    on(
      'classic.Stop',
      async (
        $: { prompt: { submit(request: { text: string }): Promise<unknown> } },
        e: unknown,
        next: (e: unknown) => unknown,
      ) => {
        await $.prompt.submit({ text: 'keep going' });
        return next(e);
      },
    );
  });
  const base = fakePorts().ports;
  const open = () =>
    session(
      { resumer },
      {
        ports: {
          ...base,
          session: { ...base.session, turns: () => Promise.resolve(1) },
          prompts: { ...base.prompts, submit: () => Promise.resolve({}) },
        },
      },
    );

  test('a call refused because the host ended its input, not because of a stop, raises no toast', async () => {
    const s = open();
    await s.host.load([modPlugin(inline('resumer'), resumer)]);
    s.host.input.endInput();
    await s.host.fire('classic.Stop', { hook_event_name: 'Stop' });
    expect(s.host.ui.toasts.visible()).toEqual([]);
  });

  test('the toast belongs to claude-code, not to the mod that was refused', async () => {
    const s = open();
    await s.host.load([modPlugin(inline('resumer'), resumer)]);
    s.host.input.interrupt();
    await s.host.fire('classic.Stop', { hook_event_name: 'Stop' });
    expect(s.host.ui.toasts.visible().map((toast) => toast.plugin)).toEqual(['claude-code']);
  });
});
