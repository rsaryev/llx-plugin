/**
 * plugins/mods/admin.md § Know what happens by default, The guard protects what you manage.
 * Artifact identity is a fact from the host, not an editable description or a guessed private field.
 */
import { expect, test } from 'bun:test';
import { apiHarness } from '../../support/mods-api.ts';
import { fn, record } from '../../support/mods-chain.ts';
import { managed, session } from '../../support/mods-load.ts';
import { spec } from '../../support/spec.ts';

spec('policy.mods.Know what happens by default.The guard protects what you manage', () => {
  test('an organization rewrite cannot launder managed tool identity into a user hook', async () => {
    const original = { description: 'managed tool description' };
    const trace: string[] = [];
    const s = session(
      {},
      {
        policy: managed({}),
        firesSessionStart: false,
        isManagedTool: (input) => input === original,
      },
    );
    await s.host.load([]);
    const { api } = await apiHarness();
    s.host.chain.register({ name: 'organization', api }, 'prepend', [
      fn('tool.describe', (_$, e, next) =>
        next({ ...record(e), description: 'rewritten by the organization' }),
      ),
    ]);
    s.host.chain.register({ name: 'user', api }, 'user', [
      fn('tool.describe', (_$, e, next) => (trace.push('user'), next(e))),
    ]);
    const result = await s.host.fire('tool.describe', original, {
      core: (input) => Promise.resolve(input),
    });
    expect(result).toMatchObject({ description: 'rewritten by the organization' });
    expect(trace).toEqual([]);
    await s.host.fire(
      'tool.describe',
      { description: 'ordinary tool' },
      {
        core: (input) => Promise.resolve(input),
      },
    );
    expect(trace).toEqual(['user']);
  });

  test('a stored skill row remains protected after an organization changes its text', async () => {
    const original = { message: { content: 'stored skill instructions' } };
    const trace: string[] = [];
    const s = session(
      {},
      {
        policy: managed({}),
        firesSessionStart: false,
        isProtectedRow: (input) => input === original,
      },
    );
    await s.host.load([]);
    const { api } = await apiHarness();
    s.host.chain.register({ name: 'organization', api }, 'prepend', [
      fn('session.append', (_$, e, next) =>
        next({ ...record(e), message: { content: 'organization changed the row' } }),
      ),
    ]);
    s.host.chain.register({ name: 'user', api }, 'user', [
      fn('session.append', (_$, e, next) => (trace.push('user'), next(e))),
    ]);
    await s.host.fire('session.append', original, { core: () => Promise.resolve({}) });
    expect(trace).toEqual([]);
    await s.host.fire(
      'session.append',
      { message: { content: 'ordinary conversation' } },
      {
        core: () => Promise.resolve({}),
      },
    );
    expect(trace).toEqual(['user']);
  });
});
