/**
 * The cut of a long reason. plugins/mods/reference.md § Limits ("A hook's `drop` reason or
 * `config.set` `deny` reason: 4,096 characters. The end of a longer reason is cut, and the drop or
 * deny still applies"); events.md § Rewrite or add to a prompt (the `drop` reason).
 */
import { describe, expect, test } from 'bun:test';
import { clampReason } from '../../../src/mods/events/index.ts';
import { MOD_LIMITS } from '../../../src/protocol/mods-limits.ts';
import { fn } from '../../support/mods-chain.ts';
import { eventHarness } from '../../support/mods-events.ts';
import { spec } from '../../support/spec.ts';

const LIMIT = 4096;
const letters = (count: number): string =>
  'abcdefghij'.repeat(Math.ceil(count / 10)).slice(0, count);

describe('a drop or deny reason over 4,096 characters', () => {
  spec('mods.limit.drop', () => {
    test('the limit is 4,096', () => {
      expect(MOD_LIMITS.reasonChars).toBe(LIMIT);
    });

    test('a drop reason of exactly 4,096 characters is kept, one of 4,097 loses its end, and the drop still applies', async () => {
      for (const [length, kept] of [
        [LIMIT, LIMIT],
        [LIMIT + 1, LIMIT],
        [20_000, LIMIT],
      ] as const) {
        const h = eventHarness();
        const reason = letters(length);
        h.mod('my-mod', 'user', [fn('prompt.submit', () => Promise.resolve({ drop: reason }))]);
        const result = await h.fire('prompt.submit', { text: 'x' });
        expect(result).toEqual({ drop: reason.slice(0, kept) });
        expect(h.coreSeen).toEqual([]);
        expect(h.reports).toEqual([]);
      }
    });

    test('a config.set deny reason is cut the same way, at its end, and the deny still applies', async () => {
      const h = eventHarness();
      const reason = letters(LIMIT + 500);
      h.mod('my-mod', 'user', [fn('config.set', () => Promise.resolve({ deny: reason }))]);
      expect(await h.fire('config.set', { value: 1 })).toEqual({ deny: reason.slice(0, LIMIT) });
      expect(h.coreSeen).toEqual([]);
    });

    test('a .catch handler answering a long drop is cut too, and a hook that is not skipped is not reported', async () => {
      const h = eventHarness();
      h.mod('my-mod', 'user', [
        fn('prompt.submit', () => Promise.reject(new Error('boom')), {
          handler: () => Promise.resolve({ drop: letters(LIMIT + 1) }),
        }),
      ]);
      expect(await h.fire('prompt.submit', { text: 'x' })).toEqual({ drop: letters(LIMIT) });
      expect(h.reports).toEqual([]);
    });

    test('only those two reasons are cut: a tool.call deny is not', async () => {
      const h = eventHarness();
      const reason = letters(LIMIT + 10);
      h.mod('my-mod', 'user', [fn('tool.call', () => Promise.resolve({ deny: reason }))]);
      expect(await h.fire('tool.call', { tool: 'Bash' })).toEqual({ deny: reason });
    });
  });

  describe('judgment (spec/judgments.md): a character is a code point', () => {
    test('the cut never splits a surrogate pair', () => {
      const emoji = '\u{1F600}';
      const cut = clampReason(emoji.repeat(LIMIT + 1));
      expect(Array.from(cut)).toHaveLength(LIMIT);
      expect(cut.endsWith(emoji)).toBe(true);
      expect(clampReason('short')).toBe('short');
    });
  });
});
