/**
 * Plan mode, the organization's ceiling and `tool.check`. plugins/mods/events.md § Approve or
 * refuse a tool call before the user is asked (the note on plan mode); permissions.md § Hook
 * approvals in plan mode: a mod "can't approve a file edit or another call that isn't read-only,
 * though it can still block such a call", and a connector tool "your organization set to `ask`"
 * still prompts when a hook returns allow (`e.ceiling`, reference.md § Agent and organization
 * fields on `tool.check`). The permission mode is the host's; `mergeToolCheck` is the kit's
 * decision from it. How `ask` ranks against `deny` is the kit's reading, tested outside `spec`.
 */
import { describe, expect, test } from 'bun:test';
import { mergeToolCheck } from '../../../src/mods/events/index.ts';
import { spec } from '../../support/spec.ts';

describe('plan mode (permissions.md § Hook approvals in plan mode)', () => {
  const plan = { mode: 'plan' } as const;

  spec('mods.event.tool.check', () => {
    test('a mod cannot approve a call that is not read-only', () => {
      expect(mergeToolCheck({ decision: 'ask' }, { decision: 'allow' }, plan)).toEqual({
        decision: 'ask',
      });
      expect(mergeToolCheck({ decision: 'deny' }, { decision: 'allow' }, plan)).toEqual({
        decision: 'deny',
      });
    });

    test('it can still block such a call', () => {
      expect(mergeToolCheck({ decision: 'ask' }, { decision: 'deny', reason: 'no' }, plan)).toEqual(
        { decision: 'deny', reason: 'no' },
      );
      expect(mergeToolCheck({ decision: 'allow' }, { decision: 'deny' }, plan)).toEqual({
        decision: 'deny',
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

    test('a connector tool with ceiling ask still prompts when a mod allows it, in any mode', () => {
      for (const mode of [
        'default',
        'acceptEdits',
        'bypassPermissions',
        'dontAsk',
        'auto',
      ] as const) {
        expect(
          mergeToolCheck({ decision: 'ask' }, { decision: 'allow' }, { mode, ceiling: 'ask' }),
        ).toEqual({ decision: 'ask' });
      }
      expect(
        mergeToolCheck(
          { decision: 'ask' },
          { decision: 'allow' },
          { mode: 'plan', isReadOnly: true, ceiling: 'ask' },
        ),
      ).toEqual({ decision: 'ask' });
    });

    test('a ceiling of ask does not stop a mod from asking or blocking, and an absent ceiling caps nothing', () => {
      const ceiling = { mode: 'default', ceiling: 'ask' } as const;
      expect(mergeToolCheck({ decision: 'ask' }, { decision: 'ask' }, ceiling)).toEqual({
        decision: 'ask',
      });
      expect(
        mergeToolCheck({ decision: 'ask' }, { decision: 'deny', reason: 'no' }, ceiling),
      ).toEqual({ decision: 'deny', reason: 'no' });
      expect(
        mergeToolCheck({ decision: 'ask' }, { decision: 'allow' }, { mode: 'default' }),
      ).toEqual({ decision: 'allow' });
    });
  });
});

describe('judgment (spec/judgments.md): allow is looser than ask, and ask than deny', () => {
  const plan = { mode: 'plan' } as const;

  test('in plan mode a mod cannot loosen deny to ask, but can tighten allow to ask', () => {
    expect(mergeToolCheck({ decision: 'deny' }, { decision: 'ask' }, plan)).toEqual({
      decision: 'deny',
    });
    expect(mergeToolCheck({ decision: 'allow' }, { decision: 'ask' }, plan)).toEqual({
      decision: 'ask',
    });
  });

  test('a mod as strict as Claude Code keeps its own answer, reason included', () => {
    expect(mergeToolCheck({ decision: 'ask' }, { decision: 'ask', reason: 'why' }, plan)).toEqual({
      decision: 'ask',
      reason: 'why',
    });
  });

  test('a mod that allows a ceiling-ask call keeps its reason on the ask', () => {
    expect(
      mergeToolCheck(
        { decision: 'ask' },
        { decision: 'allow', reason: 'trusted' },
        { mode: 'default', ceiling: 'ask' },
      ),
    ).toEqual({ decision: 'ask', reason: 'trusted' });
  });
});
