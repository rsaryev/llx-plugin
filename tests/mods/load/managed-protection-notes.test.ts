/**
 * plugins/mods/admin.md § Know which hooks of a user's mod don't run.
 * Notes use the registrations the real compiler scanned; an unfiltered append is not wholly skipped.
 */
import { expect, test } from 'bun:test';
import type { ModNext, ModsApi } from '../../../src/mods/types.ts';
import {
  installed,
  managed,
  modPlugin,
  policy,
  registerOf,
  session,
} from '../../support/mods-load.ts';
import { spec } from '../../support/spec.ts';

type Next = ModNext<unknown, Promise<unknown>>;
const register = registerOf((on) => {
  on('classic.Stop', async (_$: ModsApi, e: unknown, next: Next) => next(e));
  on('prompt.section', async (_$: ModsApi, e: unknown, next: Next) => next(e));
  on('session.append', { door: 'attachment' }, async (_$: ModsApi, e: unknown, next: Next) =>
    next(e),
  );
  on('session.append', async (_$: ModsApi, e: unknown, next: Next) => next(e));
  on('prompt.submit', async (_$: ModsApi, e: unknown, next: Next) => next(e));
});

spec('policy.mods.Know what happens by default.The guard protects what you manage', () => {
  test('provides the published note and administrator guidance with each fully skipped registration', async () => {
    const s = session({ addon: register }, { policy: managed({}), firesSessionStart: false });
    const report = await s.host.load([modPlugin(installed('addon'), register)]);
    expect(report.loaded.some((mod) => mod.name === 'addon')).toBe(true);
    expect(s.host.guardedHookNotes('addon')).toEqual([
      'Its hooks on classic.Stop, prompt.section, session.append{door=attachment} do not run here: where an organization manages Claude Code, these events pass over the plugins you install',
      "Only a plugin that counts as your organization's own runs hooks on these events. An administrator sets that up in managed settings",
    ]);
    expect(s.host.guardedHookNotes('missing')).toEqual([]);
    await s.host.unloadMod('addon');
    expect(s.host.guardedHookNotes('addon')).toEqual([]);
  });

  test('has no managed-hook note without a built-in guard', async () => {
    const s = session({ addon: register }, { policy: policy(), firesSessionStart: false });
    await s.host.load([modPlugin(installed('addon'), register)]);
    expect(s.host.guardedHookNotes('addon')).toEqual([]);
  });
});
