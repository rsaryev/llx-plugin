/**
 * settings-reference.md § `permissions` (Scope "Any file"; the object with `allow`, `ask`, `deny`,
 * `additionalDirectories`, `defaultMode` ...; the example), § `permissions.allow` (a project's
 * `allow` rules apply "only after you accept the workspace trust dialog"; `--allowedTools` is a
 * per-session addition), § `permissions.ask`, § `permissions.deny` ("`--disallowedTools` adds deny
 * rules for one session alongside this key"), § `permissions.additionalDirectories` ("entries in a
 * project's `.claude/settings.json` take effect only after you accept the workspace trust dialog");
 * settings.md § "Lists merge instead of overriding" and § "Settings precedence"; permissions.md
 * § "Project allow rules and workspace trust" ("`deny` and `ask` rules aren't affected"), § "When
 * your local settings file needs trust", § "Additional directories grant file access, not
 * configuration"; managed-settings.md § "Keys that fail closed" (per-field repair of `permissions`).
 */
import { describe, expect, test } from 'bun:test';
import { issuesOf, layerOf, plain } from '../../support/settings-layers.ts';
import { permissionsOf, ruleLines } from '../../support/permissions-policy.ts';
import { spec } from '../../support/spec.ts';

const EXAMPLE = {
  permissions: {
    allow: ['Bash(npm run *)'],
    ask: ['Bash(git push *)'],
    deny: ['Read(./.env)'],
    defaultMode: 'acceptEdits',
  },
};

spec('permissions.setting.permissions', () => {
  test('the docs example sets the three rule lists and the starting mode', () => {
    const policy = permissionsOf([['user', EXAMPLE]]);
    expect(ruleLines(policy).toSorted()).toEqual([
      'allow:Bash(npm run *)@user',
      'ask:Bash(git push *)@user',
      'deny:Read(./.env)@user',
    ]);
    const start = policy.startingMode({ surface: 'terminal', autoAvailable: true });
    expect(start.outcome === 'started' && start.mode).toBe('acceptEdits');
  });

  test('is read from any file: managed, --settings, local, project and user', () => {
    for (const scope of ['managed', 'flag', 'local', 'project', 'user'] as const) {
      const policy = permissionsOf([[scope, { permissions: { deny: ['Bash(curl *)'] } }]]);
      expect(ruleLines(policy)).toEqual([`deny:Bash(curl *)@${scope}`]);
    }
  });

  test('is not read from a --add-dir directory, whose settings carry two keys only', () => {
    const read = layerOf('addDir', { permissions: { deny: ['Bash'] } });
    expect(plain(read.settings)).toEqual({});
  });

  test('that is no object is dropped with a warning in a user file', () => {
    expect(layerOf('user', { permissions: 'allow everything' }).settings).toEqual({});
    expect(issuesOf('user', { permissions: 'allow everything' })).toHaveLength(1);
  });

  test('that is no object in managed settings turns the write block on: it "can\'t read the permissions object"', () => {
    const policy = permissionsOf([['managed', { permissions: 'allow everything' }]]);
    expect(policy.blockWritesOutsideWorkingDirectories).toBe(true);
    expect(policy.rules).toEqual([]);
  });

  test('is repaired per field, not dropped whole: a bad field in managed settings spares the others', () => {
    const policy = permissionsOf([
      ['managed', { permissions: { deny: ['Bash(rm *)'], defaultMode: 'whatever' } }],
    ]);
    expect(ruleLines(policy)).toEqual(['deny:Bash(rm *)@managed']);
    const start = policy.startingMode({ surface: 'terminal', autoAvailable: true });
    expect(start.outcome === 'started' && start.mode).toBe('default');
  });
});

spec('permissions.setting.permissions.allow', () => {
  test('lists the tool uses approved without asking', () => {
    const policy = permissionsOf([
      ['user', { permissions: { allow: ['Bash(git diff *)', 'Read(~/.zshrc)'] } }],
    ]);
    expect(ruleLines(policy)).toEqual(['allow:Bash(git diff *)@user', 'allow:Read(~/.zshrc)@user']);
  });

  test("a project file's allow rules wait for the workspace trust dialog; its deny and ask rules do not", () => {
    const project = {
      permissions: { allow: ['Bash(npm test)'], ask: ['Bash(git push *)'], deny: ['Read(./.env)'] },
    };
    const untrusted = permissionsOf([['project', project]], { isFolderTrusted: () => false });
    expect(ruleLines(untrusted).toSorted()).toEqual([
      'ask:Bash(git push *)@project',
      'deny:Read(./.env)@project',
    ]);
    const trusted = permissionsOf([['project', project]], { isFolderTrusted: () => true });
    expect(ruleLines(trusted)).toContain('allow:Bash(npm test)@project');
  });

  test('a local file applies without the trust step, unless git tracks it', () => {
    const local = { permissions: { allow: ['Bash(npm test)'] } };
    const distrust = { isFolderTrusted: () => false };
    expect(ruleLines(permissionsOf([['local', local]], distrust))).toEqual([
      'allow:Bash(npm test)@local',
    ]);
    expect(
      ruleLines(permissionsOf([['local', local]], { ...distrust, localSettingsTracked: true })),
    ).toEqual([]);
  });

  test("the files combine: every file adds its entries and none removes another's", () => {
    const policy = permissionsOf([
      ['managed', { permissions: { allow: ['Bash(ls)'] } }],
      ['user', { permissions: { allow: ['Bash(pwd)'] } }],
      ['project', { permissions: { allow: ['Bash(ls)'] } }],
    ]);
    expect(ruleLines(policy)).toEqual([
      'allow:Bash(ls)@managed',
      'allow:Bash(ls)@project',
      'allow:Bash(pwd)@user',
    ]);
  });

  test('an entry that is no text is dropped with a warning and the rest stay', () => {
    expect(
      plain(layerOf('user', { permissions: { allow: ['Bash(ls)', 5, null] } }).settings),
    ).toEqual({
      permissions: { allow: ['Bash(ls)'] },
    });
    expect(issuesOf('user', { permissions: { allow: ['Bash(ls)', 5, null] } })).toHaveLength(2);
  });
});

spec('permissions.setting.permissions.ask', () => {
  test('lists the tool uses that prompt', () => {
    const policy = permissionsOf([['user', { permissions: { ask: ['Bash(git push *)'] } }]]);
    expect(ruleLines(policy)).toEqual(['ask:Bash(git push *)@user']);
  });

  test("is read from any file and a project file's ask rules apply with no trust", () => {
    for (const scope of ['managed', 'flag', 'local', 'project', 'user'] as const) {
      const policy = permissionsOf([[scope, { permissions: { ask: ['Bash(git push *)'] } }]], {
        isFolderTrusted: () => false,
        localSettingsTracked: true,
      });
      expect(ruleLines(policy)).toEqual([`ask:Bash(git push *)@${scope}`]);
    }
  });
});

spec('permissions.setting.permissions.deny', () => {
  test('lists the tool uses blocked; the docs example keeps all five rules', () => {
    const rules = [
      'Read(./.env)',
      'Read(./.env.*)',
      'Read(./secrets/**)',
      'Read(./config/credentials.json)',
      'Bash(curl *)',
    ];
    const policy = permissionsOf([['user', { permissions: { deny: rules } }]]);
    expect(policy.rules.map((rule) => rule.text)).toEqual(rules);
    expect(policy.rules.every((rule) => rule.behavior === 'deny')).toBe(true);
  });

  test('a deny from any file stands: user, project and managed all keep theirs', () => {
    const policy = permissionsOf(
      [
        ['managed', { permissions: { deny: ['Bash(a)'] } }],
        ['project', { permissions: { deny: ['Bash(b)'] } }],
        ['user', { permissions: { deny: ['Bash(c)'] } }],
      ],
      { isFolderTrusted: () => false },
    );
    expect(ruleLines(policy)).toEqual([
      'deny:Bash(a)@managed',
      'deny:Bash(b)@project',
      'deny:Bash(c)@user',
    ]);
  });
});

spec(
  [
    'permissions.setting.permissions.additionalDirectories',
    'permissions.behavior.Working directories.Persistent configuration',
  ],
  () => {
    test('lists directories outside the one the session started in', () => {
      const policy = permissionsOf([
        ['user', { permissions: { additionalDirectories: ['../docs/'] } }],
      ]);
      expect(policy.additionalDirectories).toEqual([
        { path: '../docs/', scope: 'user', repositoryOnly: false },
      ]);
    });

    test('entries of the files unite, each once', () => {
      const policy = permissionsOf([
        ['managed', { permissions: { additionalDirectories: ['/srv/shared', '/data'] } }],
        ['user', { permissions: { additionalDirectories: ['/data', '/notes'] } }],
      ]);
      expect(policy.additionalDirectories.map((entry) => entry.path)).toEqual([
        '/srv/shared',
        '/data',
        '/notes',
      ]);
    });

    test("a project file's entries wait for the trust dialog, like allow rules", () => {
      const project = { permissions: { additionalDirectories: ['/shared'] } };
      expect(
        permissionsOf([['project', project]], { isFolderTrusted: () => false })
          .additionalDirectories,
      ).toEqual([]);
      expect(
        permissionsOf([['project', project]], { isFolderTrusted: () => true })
          .additionalDirectories,
      ).toEqual([{ path: '/shared', scope: 'project', repositoryOnly: true }]);
    });

    test('a list of the settings key is no --add-dir: it carries no configuration (only file access)', () => {
      // permissions.md: directories in `permissions.additionalDirectories` "grant file access only".
      const policy = permissionsOf([['user', { permissions: { additionalDirectories: ['/x'] } }]]);
      expect(policy.additionalDirectories).toHaveLength(1);
      expect(
        plain(layerOf('addDir', { permissions: { additionalDirectories: ['/x'] } }).settings),
      ).toEqual({});
    });
  },
);

describe('a list that cannot be read in managed settings', () => {
  test('withholds allow and additionalDirectories, and the report names each grant and the list', () => {
    const raw = {
      permissions: {
        deny: 'oops',
        allow: ['Bash(ls)'],
        additionalDirectories: ['/x'],
        ask: ['Bash(a)'],
      },
    };
    const read = layerOf('managed', raw).settings.permissions;
    expect(plain(read)).toEqual({ ask: ['Bash(a)'] });
    const messages = issuesOf('managed', raw).map((found) => found.message);
    expect(
      messages.some(
        (text) => text.includes('permissions.allow') && text.includes('permissions.deny'),
      ),
    ).toBe(true);
    expect(messages.some((text) => text.includes('permissions.additionalDirectories'))).toBe(true);
  });

  test('does nothing in a user file: the unreadable list is only dropped', () => {
    const read = layerOf('user', { permissions: { deny: 'oops', allow: ['Bash(ls)'] } }).settings;
    expect(plain(read.permissions)).toEqual({ allow: ['Bash(ls)'] });
  });
});
