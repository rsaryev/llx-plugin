/**
 * A turn that was stopped, and a call whose input a hook changed. plugins/mods/troubleshoot.md §
 * `Stopped: type a message to continue; a mod cannot resume work after Stop` and § `a hook changed this
 * call's input after the model wrote it`. What the user stops and what a reviewer saw are the host's.
 */

import { describe, expect, test } from 'bun:test';
import { INPUT_CHANGED, inputChangedDenial } from '../../../src/mods/events/index.ts';
import { STOPPED_TOAST } from '../../../src/mods/api/index.ts';
import { fakePorts } from '../../../src/testing/mods/index.ts';
import { fn, record } from '../../support/mods-chain.ts';
import { eventHarness } from '../../support/mods-events.ts';
import { inline, modPlugin, registerOf, session } from '../../support/mods-load.ts';
import { spec } from '../../support/spec.ts';

describe('a turn that was stopped', () => {
  /** A session whose mod, on the Stop settings hook, tries to start a turn of its own. */
  const resuming = () => {
    const submitted: string[] = [];
    const base = fakePorts().ports;
    const resumer = registerOf((on) => {
      on(
        'classic.Stop',
        async (
          $: { prompt: { submit(request: { text: string }): Promise<unknown> } },
          _e: unknown,
          next: (e: unknown) => unknown,
        ) => {
          await $.prompt.submit({ text: 'keep going' });
          return next(_e);
        },
      );
    });
    const s = session(
      { resumer },
      {
        ports: {
          ...base,
          session: { ...base.session, turns: () => Promise.resolve(1) },
          prompts: {
            ...base.prompts,
            submit: (prompt) => (submitted.push(prompt.text), Promise.resolve({})),
          },
        },
      },
    );
    return { s, submitted, resumer };
  };
  const toasts = (s: ReturnType<typeof resuming>['s']) =>
    s.host.ui.toasts.visible().map((toast) => toast.text);

  spec(
    'mods.troubleshoot.Stopped: type a message to continue; a mod cannot resume work after Stop',
    () => {
      test('after the user stops the turn, a mod that starts work on its own is refused and the toast says so', async () => {
        const { s, submitted, resumer } = resuming();
        await s.host.load([modPlugin(inline('resumer'), resumer)]);
        s.host.input.interrupt();
        await s.host.fire('classic.Stop', { hook_event_name: 'Stop' });
        expect(submitted).toEqual([]);
        expect(toasts(s)).toEqual([STOPPED_TOAST]);
        expect(STOPPED_TOAST).toBe(
          'Stopped: type a message to continue; a mod cannot resume work after Stop',
        );
      });

      test('nothing needs fixing: after the next message the mod can start work again, and no toast appears', async () => {
        const { s, submitted, resumer } = resuming();
        await s.host.load([modPlugin(inline('resumer'), resumer)]);
        s.host.input.interrupt();
        await s.host.input.userInput();
        await s.host.fire('classic.Stop', { hook_event_name: 'Stop' });
        expect(submitted).toEqual(['keep going']);
        expect(toasts(s)).toEqual([]);
      });
    },
  );
});

describe('a hook changed the input of a call after the model wrote it', () => {
  const written = { command: 'ls' };

  spec(`mods.troubleshoot.a hook changed this call's input after the model wrote it`, () => {
    test('in auto mode a call whose input a hook changed is denied with the documented reason, and the message tells Claude to issue the call once more as recorded', () => {
      const denial = inputChangedDenial({
        mode: 'auto',
        written,
        passed: { command: 'ls -la' },
        review: 'server',
      });
      expect(denial?.decision).toBe('deny');
      expect(denial?.reason).toContain("a hook changed this call's input after the model wrote it");
      expect(denial?.reason).toContain('issue the call once more exactly as recorded');
    });

    test('the message does not say which hook changed the input, whether a mod tool.call or turn.step hook or a PreToolUse hook', async () => {
      const h = eventHarness();
      h.mod('rewriter', 'user', [
        fn('tool.call', (_$, e, next) => next({ ...e, command: 'ls -la' })),
      ]);
      await h.fire('tool.call', { tool: 'Bash', ...written });
      const passed = record(h.coreSeen[0]);
      const denial = inputChangedDenial({
        mode: 'auto',
        written: { tool: 'Bash', ...written },
        passed,
        review: 'server',
      });
      expect(denial?.reason).not.toContain('rewriter');
      expect(denial?.reason).not.toContain('tool.call');
    });

    test('an input the hooks left as it was is not denied, nor is a change in any other mode', () => {
      expect(
        inputChangedDenial({ mode: 'auto', written, passed: { command: 'ls' }, review: 'server' }),
      ).toBeUndefined();
      for (const mode of [
        'default',
        'plan',
        'acceptEdits',
        'dontAsk',
        'bypassPermissions',
      ] as const) {
        expect(
          inputChangedDenial({ mode, written, passed: { command: 'ls -la' }, review: 'server' }),
        ).toBeUndefined();
      }
    });

    test('in some terminal and VS Code sessions the same denial names the review: "a hook changed this call\'s input after auto mode reviewed it"', () => {
      const denial = inputChangedDenial({
        mode: 'auto',
        written,
        passed: { command: 'rm -rf /' },
        review: 'session',
      });
      expect(denial?.reason).toContain(INPUT_CHANGED.session);
      expect(INPUT_CHANGED.session).toBe(
        "a hook changed this call's input after auto mode reviewed it",
      );
    });

    test('a call issued once more as recorded is not changed by the hooks that left it alone, so it is not denied again', () => {
      expect(
        inputChangedDenial({ mode: 'auto', written, passed: { ...written }, review: 'server' }),
      ).toBeUndefined();
    });
  });
});
