/**
 * Classic filtering: plugins/mods/admin.md § Know which hooks of a user's mod don't run.
 * Lifetime races and unavailable identity facts are judgments, tested outside spec(...).
 */
import { expect, test } from 'bun:test';
import { CLASSIC_EVENT_NAMES } from '../../../src/protocol/mods-events.ts';
import { GUARD_ID } from '../../../src/protocol/mods-settings.ts';
import { createGuardProtection } from '../../../src/mods/load/guard-protection.ts';
import { managed, session } from '../../support/mods-load.ts';
import { spec } from '../../support/spec.ts';

async function guardModule() {
  const s = session({}, { policy: managed({}), firesSessionStart: false });
  await s.host.load([]);
  const original = s.host.active().find((mod) => mod.id === GUARD_ID);
  if (!original) throw new Error('the managed fixture did not load the built-in guard');
  let unloads = 0;
  return {
    host: s.host,
    mod: { ...original, unload: () => ((unloads += 1), Promise.resolve()) },
    unloads: () => unloads,
  };
}

spec("policy.mods.Know which hooks of a user's mod don't run.classic.<Event>", () => {
  test('every official classic event skips the user tier, not organization or built-in hooks', async () => {
    const fixture = await guardModule();
    const protection = createGuardProtection({});
    protection.bind(fixture.mod);
    for (const event of CLASSIC_EVENT_NAMES) {
      const access = { event, input: {}, tier: 'user', isBuiltin: false } as const;
      expect(protection.admit(access)).toBe(false);
      expect(protection.admit({ ...access, isBuiltin: true })).toBe(true);
      for (const tier of ['prepend', 'append', 'builtin'] as const) {
        expect(protection.admit({ ...access, tier })).toBe(true);
      }
    }
    await fixture.host.dispose();
  });
});

test('an older guard unload cannot deactivate a newer binding; every unload runs once', async () => {
  const fixture = await guardModule();
  const protection = createGuardProtection({});
  const access = { event: 'settings.read', input: {}, tier: 'user', isBuiltin: false } as const;
  expect(protection.admit(access)).toBe(true);
  const older = protection.bind(fixture.mod);
  const current = protection.bind(fixture.mod);
  await older.unload();
  expect(protection.admit(access)).toBe(false);
  await older.unload();
  expect(protection.admit(access)).toBe(false);
  await current.unload();
  expect(protection.admit(access)).toBe(true);
  expect(fixture.unloads()).toBe(2);
  await fixture.host.dispose();
});

test('a failed identity lookup skips the untrusted hook without granting it the event', async () => {
  const fixture = await guardModule();
  const protection = createGuardProtection({
    isManagedTool: () => {
      throw new Error('identity service unavailable');
    },
  });
  protection.bind(fixture.mod);
  const access = { event: 'tool.describe', input: {}, tier: 'user', isBuiltin: false } as const;
  expect(protection.admit(access)).toBe(false);
  expect(protection.admit({ ...access, isBuiltin: true })).toBe(true);
  await fixture.host.dispose();
});
