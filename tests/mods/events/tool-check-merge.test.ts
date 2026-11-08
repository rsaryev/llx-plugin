/**
 * Plan mode and `tool.check`. plugins/mods/events.md § Approve or refuse a tool call before the user
 * is asked (the note on plan mode); permissions.md § Hook approvals in plan mode: a mod "can't
 * approve a file edit or another call that isn't read-only, though it can still block such a call".
 * The permission mode is the host's; `mergeToolCheck` is the kit's decision from it.
 */
import { describe, expect, test } from 'bun:test';
import { mergeToolCheck } from '../../../src/mods/events/index.ts';
import { spec } from '../../support/spec.ts';

spec('mods.event.tool.check', () => {
  describe('plan mode (permissions.md § Hook approvals in plan mode)', () => {
    const plan = { mode: 'plan' } as const;
    test('a mod cannot approve a call that is not read-only, and cannot loosen what Claude Code decided', () => {
      expect(mergeToolCheck({ decision: 'ask' }, { decision: 'allow' }, plan)).toEqual({
        decision: 'ask',
      });
      expect(mergeToolCheck({ decision: 'deny' }, { decision: 'ask' }, plan)).toEqual({
        decision: 'deny',
      });
    });
    test('it can still block, and tighten', () => {
      expect(mergeToolCheck({ decision: 'ask' }, { decision: 'deny', reason: 'no' }, plan)).toEqual(
        { decision: 'deny', reason: 'no' },
      );
      expect(mergeToolCheck({ decision: 'allow' }, { decision: 'ask' }, plan)).toEqual({
        decision: 'ask',
      });
    });
    test('a read-only call is not bound, and no other mode is', () => {
      expect(
        mergeToolCheck(
          { decision: 'ask' },
          { decision: 'allow' },
          { mode: 'plan', isReadOnly: true },
        ),
      ).toEqual({ decision: 'allow' });
      expect(
        mergeToolCheck({ decision: 'ask' }, { decision: 'allow' }, { mode: 'default' }),
      ).toEqual({ decision: 'allow' });
      expect(
        mergeToolCheck({ decision: 'deny' }, { decision: 'allow' }, { mode: 'acceptEdits' }),
      ).toEqual({ decision: 'allow' });
    });
  });
});
