/**
 * `next.to(e, tier)`: skip to a later tier. plugins/mods/reference.md § The hook function:
 * "Skips to a later tier, which is `append`, `builtin`, or `core`. `next.to(e, 'append')` skips the
 * mods a user installed. Only a mod in `prependPlugins` or `appendPlugins` can call it."
 */
import { expect, test } from 'bun:test';
import { fn, harness, messageOf } from '../../support/mods-chain.ts';
import { spec } from '../../support/spec.ts';

type Caller = 'prepend' | 'user' | 'append';
type Target = 'append' | 'builtin' | 'core';

/** Every tier has a mod on `tool.call`; the mod of tier `caller` skips to `target`. */
async function ranBy(caller: Caller, target: Target) {
  const h = harness();
  const ran: string[] = [];
  for (const tier of ['prepend', 'user', 'append', 'builtin'] as const) {
    h.mod(`${tier}-mod`, tier, [
      fn('tool.call', async (_$, e, next) => {
        ran.push(tier);
        if (tier !== caller) return next(e);
        try {
          return await next.to(e, target);
        } catch (error) {
          ran.push(`refused: ${messageOf(error)}`);
          return 'refused';
        }
      }),
    ]);
  }
  const result = await h.fire(
    'tool.call',
    {},
    { core: () => (ran.push('core'), Promise.resolve('done')) },
  );
  return { ran, result };
}

spec('mods.hookArgument.next.to(e, tier)', () => {
  test('next.to(e, append) from a prepend mod skips the mods a user installed', async () => {
    const { ran, result } = await ranBy('prepend', 'append');
    expect(ran).toEqual(['prepend', 'append', 'builtin', 'core']);
    expect(result).toBe('done');
  });

  test('next.to(e, builtin) skips the appended mods, and next.to(e, core) every later mod', async () => {
    expect((await ranBy('prepend', 'builtin')).ran).toEqual(['prepend', 'builtin', 'core']);
    expect((await ranBy('prepend', 'core')).ran).toEqual(['prepend', 'core']);
    expect((await ranBy('append', 'core')).ran).toEqual(['prepend', 'user', 'append', 'core']);
  });

  test('only a mod in prependPlugins or appendPlugins can call it', async () => {
    const { ran, result } = await ranBy('user', 'core');
    expect(result).toBe('refused');
    expect(ran).toContain(
      'refused: next.to is only for a mod listed in prependPlugins or appendPlugins',
    );
    expect(ran).not.toContain('core');
  });

  test("the tier is a later one: append, builtin or core (judgment: not the caller's own tier)", async () => {
    const same = await ranBy('append', 'append');
    expect(same.result).toBe('refused');
    expect(same.ran.join('|')).toContain('next.to skips ahead');
  });

  test('the event passed to next.to reaches the hook it lands on, as with next', async () => {
    const h = harness();
    h.mod('org', 'prepend', [
      fn('prompt.submit', (_$, e, next) => next.to({ ...e, text: 'changed' }, 'builtin')),
    ]);
    await h.fire('prompt.submit', { text: 'original' });
    expect(h.coreSeen).toEqual([{ text: 'changed' }]);
  });
});
