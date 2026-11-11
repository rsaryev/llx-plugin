/**
 * Judgment: a hook cannot mutate the shared caller's identity through next.origin.
 * The docs expose readonly origin data but do not prescribe how the host stores it.
 */
import { expect, test } from 'bun:test';
import { fn, harness } from '../../support/mods-chain.ts';

test('next.origin is a frozen copy, not a mutable reference to the engine origin', async () => {
  const h = harness();
  const origin = { plugin: 'engine', tier: 'core' } as const;
  let changed = true;
  h.mod('observer', 'user', [
    fn('tool.call', (_$, e, next) => {
      changed = Reflect.set(next.origin, 'tier', 'user');
      return next(e);
    }),
  ]);
  await h.chain.dispatch(
    'tool.call',
    { tool: 'Read' },
    {
      origin,
      signal: new AbortController().signal,
      report: () => undefined,
      core: () => Promise.resolve({}),
    },
  );
  expect(changed).toBe(false);
  expect(origin).toEqual({ plugin: 'engine', tier: 'core' });
  expect(Object.isFrozen(origin)).toBe(false);
});
