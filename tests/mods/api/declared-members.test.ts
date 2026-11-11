/**
 * The members of `$` and the event the declarations add over the reference page (declarations
 * 2.1.321, AGENTS.md E2a; spec/judgments.md, D1): `$.ui.cancelNotify` (claude-code/index.d.ts:2536),
 * `$.prompt.media` (:3143), `$.prompt.paint` (:3168), `$.session.surface` (:2980),
 * `$.session.identity` (:3081) and the engine event `prompt.change` (:4416).
 */
import { describe, expect, test } from 'bun:test';
import { OPTIONAL_PORT_DEFAULTS, withDefaultPorts } from '../../../src/mods/api/index.ts';
import { eventInputProblem, EVENT_RULES } from '../../../src/mods/events/index.ts';
import { API_EVENT_NAMES, ENGINE_EVENT_NAMES } from '../../../src/protocol/mods-events.ts';
import { fakePorts } from '../../../src/testing/mods/index.ts';
import { fn } from '../../support/mods-chain.ts';
import { apiHarness } from '../../support/mods-api.ts';
import { fakeInterface, uiOver } from '../../support/mods-ui.ts';
import { uiRules } from '../../../src/mods/ui/index.ts';

const box = { text: 'fix the bug', cursor: 3 };
const decorations = [{ start: 0, end: 3, bold: true }];

describe('$.prompt.paint and $.prompt.media', () => {
  test('paint fires prompt.paint and answers the box the port painted, for this plugin', async () => {
    const asked: unknown[] = [];
    const h = await apiHarness({
      ports: {
        promptBox: {
          paint: (request, plugin) => {
            asked.push([request, plugin]);
            return Promise.resolve({ isPainted: true, ...box });
          },
          media: () => Promise.resolve({ unreadable: 'no image' }),
        },
      },
    });
    const seen: unknown[] = [];
    await h.mod('watch', 'prepend', [fn('prompt.paint', (_$, e, next) => (seen.push(e), next(e)))]);
    expect(await h.api.prompt.paint({ decorations, text: box.text })).toEqual({
      isPainted: true,
      ...box,
    });
    expect(seen).toEqual([{ decorations, text: box.text }]);
    expect(asked).toEqual([[{ decorations, text: box.text }, 'my-mod']]);
  });

  test('without the port, paint paints nothing and hands back the box as read', async () => {
    const { ports } = fakePorts({
      prompts: { ...fakePorts().ports.prompts, read: () => Promise.resolve(box) },
    });
    const { account, promptBox, notifications, ...given } = ports;
    const h = await apiHarness({ ports: withDefaultPorts(given) });
    expect(await h.api.prompt.paint({ decorations })).toEqual({ isPainted: false, ...box });
    expect([account, promptBox, notifications].every(Boolean)).toBe(true);
  });

  test('media fires no event and asks the port for the slice', async () => {
    const asked: unknown[] = [];
    const slice = { type: 'image', mediaType: 'image/png', base64: 'AA==', size: 1 } as const;
    const h = await apiHarness({
      ports: {
        promptBox: {
          paint: () => Promise.reject(new Error('not asked')),
          media: (request, plugin) => (asked.push([request, plugin]), Promise.resolve(slice)),
        },
      },
    });
    expect(await h.api.prompt.media({ id: 'img-1', offset: 4 })).toEqual(slice);
    expect(asked).toEqual([[{ id: 'img-1', offset: 4 }, 'my-mod']]);
    expect(API_EVENT_NAMES).not.toContain('prompt.media');
  });

  test('without the port, media answers { deny }', async () => {
    const h = await apiHarness({ ports: OPTIONAL_PORT_DEFAULTS });
    expect(await h.api.prompt.media({ id: 'img-1' })).toEqual({
      deny: 'no submission in flight carries this id',
    });
  });
});

describe('$.session.surface and $.session.identity', () => {
  test('surface is the first of surfaces(), or null where nothing draws', async () => {
    const session = (surfaces: string[]) => ({
      ...fakePorts().ports.session,
      surfaces: () => Promise.resolve(surfaces),
    });
    const drawn = await apiHarness({ ports: { session: session(['vscode', 'terminal']) } });
    expect(await drawn.api.session.surface()).toBe('vscode');
    const none = await apiHarness({ ports: { session: session([]) } });
    expect(await none.api.session.surface()).toBeNull();
  });

  test('identity answers a mod of managed settings (prepend, append) and denies any other', async () => {
    const signedIn = { kind: 'claude.ai', isVerified: true, organizationId: 'org-1' };
    const account = { identity: () => Promise.resolve(signedIn) };
    const managed = await apiHarness({ tier: 'prepend', ports: { account } });
    expect(await managed.api.session.identity()).toEqual(signedIn);
    const appended = await apiHarness({ tier: 'append', ports: { account } });
    expect(await appended.api.session.identity()).toEqual(signedIn);
    const user = await apiHarness({ tier: 'user', ports: { account } });
    expect(await user.api.session.identity()).toEqual({
      deny: 'the calling mod is not one managed settings enable and load in place',
    });
  });

  test("a hook's { deny } resolves; the default port is a session with no identity", async () => {
    const h = await apiHarness({ tier: 'append', ports: OPTIONAL_PORT_DEFAULTS });
    expect(await h.api.session.identity()).toEqual({ kind: 'none', isVerified: false });
    await h.mod('policy', 'prepend', [fn('session.identity', () => ({ deny: 'not here' }))]);
    expect(await h.api.session.identity()).toEqual({ deny: 'not here' });
  });
});

describe('$.ui.cancelNotify', () => {
  test('fires ui.cancelNotify { key } and asks the host for this plugin', async () => {
    const asked: unknown[] = [];
    const { iface } = fakeInterface();
    const h = await apiHarness({
      rules: uiRules,
      ui: uiOver(iface),
      ports: {
        notifications: {
          cancel: (key, plugin) => (asked.push([key, plugin]), Promise.resolve({ isSent: true })),
        },
      },
    });
    const seen: unknown[] = [];
    await h.mod('watch', 'prepend', [
      fn('ui.cancelNotify', (_$, e, next) => (seen.push(e), next(e))),
    ]);
    expect(await h.api.ui.cancelNotify('build')).toEqual({ isSent: true });
    expect(seen).toEqual([{ key: 'build' }]);
    expect(asked).toEqual([['build', 'my-mod']]);
  });

  test('without the port it reaches no host: isSent false', async () => {
    const { iface } = fakeInterface();
    const h = await apiHarness({
      rules: uiRules,
      ui: uiOver(iface),
      ports: OPTIONAL_PORT_DEFAULTS,
    });
    expect(await h.api.ui.cancelNotify('build')).toEqual({ isSent: false });
  });
});

describe('prompt.change', () => {
  test('is an engine event: the box, its cursor and who changed it; it answers { text }', () => {
    expect(ENGINE_EVENT_NAMES).toContain('prompt.change');
    const e = { text: 'hi', cursor: 2, origin: { kind: 'history' } };
    expect(eventInputProblem('prompt.change', e)).toBeUndefined();
    expect(
      eventInputProblem('prompt.change', { text: 'hi', cursor: -1, origin: {} }),
    ).toBeDefined();
    const rule = EVENT_RULES['prompt.change'];
    expect(rule?.shapeProblem?.({ text: 'hi' }, false, e)).toBeUndefined();
    expect(rule?.shapeProblem?.({ text: 1 }, false, e)).toBeDefined();
    // "Observe only": core reads the event as fired, whatever a hook passed on.
    expect(rule?.coreInput?.(e, { ...e, text: 'changed' })).toEqual(e);
  });
});
