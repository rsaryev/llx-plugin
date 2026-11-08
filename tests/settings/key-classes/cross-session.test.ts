/**
 * settings-reference.md § `crossSessionInbound` and § `isolatePeerMachines`; errors.md §
 * crossSessionInbound must be one of accept, hold, refuse (the warning, verbatim for a user,
 * project, local or `--settings` file). The managed-exception rows are proven by
 * tests/settings/merge-core/managed-exceptions.test.ts.
 */
import { describe, expect, test } from 'bun:test';
import { messagesOf, viewOf, type Source } from '../../support/key-classes.ts';
import { spec } from '../../support/spec.ts';

const mode = (value: unknown) => ({ crossSessionInbound: value });
const get = (...sources: readonly Source[]) => viewOf(...sources).get('crossSessionInbound');

spec('settings.key.crossSessionInbound', () => {
  describe('the value in force', () => {
    test('is unset when no file sets it, so Claude Code decides per message', () => {
      expect(get(['user', { model: 'a' }])).toBeUndefined();
    });

    test('managed settings are read first, then --settings, then user settings: the first value found applies', () => {
      expect(
        get(['managed', mode('accept')], ['flag', mode('refuse')], ['user', mode('hold')]),
      ).toBe('accept');
      expect(get(['flag', mode('accept')], ['user', mode('refuse')])).toBe('accept');
      expect(get(['user', mode('hold')])).toBe('hold');
    });

    test('a project or local value applies only when it is stricter than what the trusted sources give', () => {
      expect(get(['user', mode('hold')], ['project', mode('refuse')])).toBe('refuse');
      expect(get(['user', mode('refuse')], ['local', mode('hold')])).toBe('refuse');
      expect(get(['managed', mode('hold')], ['project', mode('accept')])).toBe('hold');
      expect(get(['user', mode('accept')], ['local', mode('accept')])).toBe('accept');
    });

    test('when none of the trusted sources sets a value, a project or local hold or refuse still applies', () => {
      expect(get(['project', mode('hold')])).toBe('hold');
      expect(get(['local', mode('refuse')])).toBe('refuse');
    });

    test('a project or local accept does not replace the per-message default', () => {
      expect(get(['project', mode('accept')])).toBeUndefined();
    });
  });

  describe('a value Claude Code does not recognize', () => {
    test('is reported with the warning of the docs, naming the value', () => {
      const [message] = messagesOf('user', mode('reject'));
      expect(message).toBe(
        '"crossSessionInbound" must be one of "accept", "hold", "refuse"; received "reject". This value was ignored; while it is present, cross-session messages are held for your approval instead of being delivered. Set it to one of the values above.',
      );
    });

    for (const scope of ['user', 'project', 'local', 'flag'] as const) {
      test(`in a ${scope} file it holds inbound messages`, () => {
        expect(get([scope, mode('reject')])).toBe('hold');
      });

      test(`in a ${scope} file it holds them even when a source that takes precedence sets accept`, () => {
        expect(get(['managed', mode('accept')], [scope, mode('reject')])).toBe('hold');
      });

      test(`a refuse that another source sets still applies over a ${scope} unrecognized value`, () => {
        expect(get(['managed', mode('refuse')], [scope, mode('reject')])).toBe('refuse');
      });
    }

    test('clears when the value is fixed or removed', () => {
      expect(get(['managed', mode('accept')], ['user', mode('accept')])).toBe('accept');
      expect(get(['managed', mode('accept')], ['user', { model: 'a' }])).toBe('accept');
    });

    test('in managed settings it is treated as refuse', () => {
      expect(get(['managed', mode('reject')])).toBe('refuse');
      expect(get(['managed', mode('reject')], ['user', mode('accept')])).toBe('refuse');
    });
  });
});

spec('settings.key.isolatePeerMachines', () => {
  const get = (...sources: readonly Source[]) => viewOf(...sources).get('isolatePeerMachines');

  describe('a true from any scope applies', () => {
    for (const scope of ['managed', 'flag', 'local', 'project', 'user'] as const) {
      test(scope, () => {
        expect(get([scope, { isolatePeerMachines: true }])).toBe(true);
      });
    }
  });

  test('a checked-in project file can turn the requirement on but not off', () => {
    expect(
      get(['user', { isolatePeerMachines: false }], ['project', { isolatePeerMachines: true }]),
    ).toBe(true);
    expect(
      get(['user', { isolatePeerMachines: true }], ['project', { isolatePeerMachines: false }]),
    ).toBe(true);
    expect(
      get(['managed', { isolatePeerMachines: true }], ['project', { isolatePeerMachines: false }]),
    ).toBe(true);
  });

  describe('a false', () => {
    test('is the same as no requirement: cross-machine messages do not prompt', () => {
      expect(get(['user', { isolatePeerMachines: false }])).toBe(false);
      expect(get(['user', { model: 'a' }])).toBeUndefined();
    });

    test('does not undo a managed true', () => {
      expect(
        get(['managed', { isolatePeerMachines: true }], ['user', { isolatePeerMachines: false }]),
      ).toBe(true);
    });
  });

  test('a value that is no Boolean is dropped with a warning', () => {
    expect(get(['user', { isolatePeerMachines: 'true' }])).toBeUndefined();
    expect(messagesOf('user', { isolatePeerMachines: 'true' })).toHaveLength(1);
  });
});

describe('the unrecognized-value hold is a floor, not a value', () => {
  test('it does not weaken a stricter value and leaves other keys alone', () => {
    const view = viewOf(['user', { crossSessionInbound: 'reject', isolatePeerMachines: true }]);
    expect(view.get('isolatePeerMachines')).toBe(true);
    expect(view.get('crossSessionInbound')).toBe('hold');
    expect(
      viewOf(
        ['user', { crossSessionInbound: 'reject' }],
        ['managed', { crossSessionInbound: 'hold' }],
      ).get('crossSessionInbound'),
    ).toBe('hold');
  });
});
