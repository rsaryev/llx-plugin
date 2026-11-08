/**
 * hooks.md § "Permission update entries": six entry types, each with a `destination`; "A hook can
 * echo one of the `permission_suggestions` it received as its own `updatedPermissions` output".
 * Writing an entry to `.claude/settings*.json`, and the `bypassPermissions` rules that make it a
 * no-op, are the host's and are not claimed.
 */
import { describe, expect, test } from 'bun:test';
import { parsePermissionUpdates } from '../../../src/hooks/index.ts';
import type { PermissionUpdate } from '../../../src/protocol/official.ts';
import { spec } from '../../support/spec.ts';

const DESTINATIONS = ['session', 'localSettings', 'projectSettings', 'userSettings'] as const;
const read = (...entries: unknown[]) => parsePermissionUpdates(entries);

const RULE_TYPES = ['addRules', 'replaceRules', 'removeRules'] as const;

describe.each(RULE_TYPES)('%s', (type) => {
  spec(`hooks.permissionUpdate.${type}`, () => {
    test('rules are {toolName, ruleContent?}, with a behavior and a destination', () => {
      const entry = {
        type,
        rules: [{ toolName: 'Bash', ruleContent: 'npm test' }, { toolName: 'Read' }],
        behavior: 'allow',
        destination: 'localSettings',
      };
      const parsed: unknown = read(entry);
      expect(parsed).toEqual({ updates: [entry], issues: [] });
    });

    test.each(['allow', 'deny', 'ask'])('behavior %s is valid', (behavior) => {
      expect(read({ type, rules: [], behavior, destination: 'session' }).issues).toEqual([]);
    });

    test('a behavior outside allow, deny and ask is an issue naming the field', () => {
      const parsed = read({ type, rules: [], behavior: 'maybe', destination: 'session' });
      expect(parsed.updates).toEqual([]);
      expect(parsed.issues[0]?.path).toBe('permissionUpdates[0].behavior');
    });

    test('missing and ill-typed fields are issues', () => {
      for (const [bad, field] of [
        [{ type, behavior: 'allow', destination: 'session' }, 'rules'],
        [{ type, rules: 'Bash', behavior: 'allow', destination: 'session' }, 'rules'],
        [
          { type, rules: [{ ruleContent: 'x' }], behavior: 'allow', destination: 'session' },
          'rules.0.toolName',
        ],
        [{ type, rules: [], destination: 'session' }, 'behavior'],
        [{ type, rules: [], behavior: 'allow' }, 'destination'],
      ] as const) {
        expect(read(bad).issues[0]?.path).toBe(`permissionUpdates[0].${field}`);
      }
    });
  });
});

spec('hooks.permissionUpdate.setMode', () => {
  test.each(['default', 'auto', 'acceptEdits', 'dontAsk', 'bypassPermissions', 'plan'])(
    'mode %s is valid',
    (mode) => {
      expect(read({ type: 'setMode', mode, destination: 'session' })).toEqual({
        updates: [{ type: 'setMode', mode, destination: 'session' }],
        issues: [],
      });
    },
  );

  test('manual is an alias for default: the entry carries default', () => {
    expect(read({ type: 'setMode', mode: 'manual', destination: 'session' }).updates).toEqual([
      { type: 'setMode', mode: 'default', destination: 'session' },
    ]);
  });

  test('a mode the docs do not list is an issue', () => {
    const parsed = read({ type: 'setMode', mode: 'yolo', destination: 'session' });
    expect(parsed.updates).toEqual([]);
    expect(parsed.issues[0]?.path).toBe('permissionUpdates[0].mode');
  });

  test('a missing mode is an issue', () => {
    expect(read({ type: 'setMode', destination: 'session' }).issues[0]?.path).toBe(
      'permissionUpdates[0].mode',
    );
  });
});

describe.each(['addDirectories', 'removeDirectories'] as const)('%s', (type) => {
  spec(`hooks.permissionUpdate.${type}`, () => {
    test('directories are an array of path strings', () => {
      const entry = { type, directories: ['/work/a', '/work/b'], destination: 'projectSettings' };
      const parsed: unknown = read(entry);
      expect(parsed).toEqual({ updates: [entry], issues: [] });
    });

    test('missing and ill-typed directories are issues', () => {
      expect(read({ type, destination: 'session' }).issues[0]?.path).toBe(
        'permissionUpdates[0].directories',
      );
      expect(read({ type, directories: '/work', destination: 'session' }).issues[0]?.path).toBe(
        'permissionUpdates[0].directories',
      );
      expect(read({ type, directories: [1], destination: 'session' }).issues[0]?.path).toBe(
        'permissionUpdates[0].directories.0',
      );
    });
  });
});

describe('every entry', () => {
  test.each(DESTINATIONS)('the destination %s is valid', (destination) => {
    expect(read({ type: 'addDirectories', directories: [], destination }).issues).toEqual([]);
  });

  test('a destination outside the table is an issue; cliArg, which the official type has, is accepted (judgment)', () => {
    expect(
      read({ type: 'addDirectories', directories: [], destination: 'globalSettings' }).issues,
    ).toHaveLength(1);
    expect(read({ type: 'addDirectories', directories: [], destination: 'cliArg' }).issues).toEqual(
      [],
    );
  });

  test('an unknown type is an issue, and a bad entry never takes the good ones down', () => {
    const good: PermissionUpdate = { type: 'setMode', mode: 'plan', destination: 'session' };
    const parsed = read({ type: 'removeEverything' }, good, 'text');
    expect(parsed.updates).toEqual([good]);
    expect(parsed.issues.map((issue) => issue.path.split('.')[0])).toEqual([
      'permissionUpdates[0]',
      'permissionUpdates[2]',
    ]);
  });

  test('something that is not an array is an issue', () => {
    expect(parsePermissionUpdates({ type: 'setMode' }).issues[0]?.path).toBe('permissionUpdates');
  });

  test('a permission_suggestions entry echoed back round-trips unchanged', () => {
    const suggestions: PermissionUpdate[] = [
      {
        type: 'addRules',
        rules: [{ toolName: 'Bash', ruleContent: 'git push:*' }],
        behavior: 'allow',
        destination: 'localSettings',
      },
      { type: 'setMode', mode: 'acceptEdits', destination: 'session' },
      { type: 'addDirectories', directories: ['/work/lib'], destination: 'projectSettings' },
    ];
    expect(parsePermissionUpdates(JSON.parse(JSON.stringify(suggestions)))).toEqual({
      updates: suggestions,
      issues: [],
    });
  });
});
