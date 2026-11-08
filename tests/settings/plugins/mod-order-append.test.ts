/**
 * settings-reference.md § `appendPlugins` ("List the managed plugins whose mods run after every mod a
 * user installs, in the listed order. An id listed in both `prependPlugins` and `appendPlugins` is
 * prepended. In managed settings, Claude Code skips an id whose plugin doesn't count as your
 * organization's"; Scope: User or managed, read from user settings only on a machine with no managed
 * settings and a session whose credential isn't a Team or Enterprise `/login`, ignored in project and
 * local settings and in a `--settings` file), plugins/mods/admin.md § "Install your organization's mods
 * and set the order" (`appendPlugins`: "your mod runs after every user's mod"; the rules that decide
 * which ids take effect). The decisions the docs leave open about both keys are tested here too.
 */
import { describe, expect, test } from 'bun:test';
import { spec } from '../../support/spec.ts';
import { plain } from '../../support/settings-layers.ts';
import type { Source } from '../../support/plugin-settings.ts';
import {
  acme,
  bareMachine,
  managedMachine,
  order,
  orgMods,
  skippedIds,
  teamLogin,
} from '../../support/mod-order.ts';

spec('settings.key.appendPlugins', () => {
  test('the docs example runs acme-audit after every user mod', () => {
    const result = order([acme({ appendPlugins: ['acme-audit@acme-tools'] })], managedMachine);
    expect(plain(result.append)).toEqual(['acme-audit@acme-tools']);
    expect(result.skipped).toEqual([]);
  });

  test('the listed order is the order', () => {
    const result = order(
      [acme({ appendPlugins: ['acme-guard@acme-tools', 'acme-audit@acme-tools'] })],
      managedMachine,
    );
    expect(plain(result.append)).toEqual(['acme-guard@acme-tools', 'acme-audit@acme-tools']);
  });

  test('an id listed in both keys is prepended, not appended', () => {
    const result = order(
      [
        acme({
          prependPlugins: ['acme-guard@acme-tools', 'sec-default@builtin'],
          appendPlugins: ['acme-audit@acme-tools', 'acme-guard@acme-tools'],
        }),
      ],
      managedMachine,
    );
    expect(plain(result.prepend)).toEqual(['acme-guard@acme-tools', 'sec-default@builtin']);
    expect(plain(result.append)).toEqual(['acme-audit@acme-tools']);
  });

  test('an id whose plugin does not count as the organization’s is skipped, with the key named in the line', () => {
    const result = order(
      [acme({ appendPlugins: ['acme-audit@acme-tools'] })],
      managedMachine,
      orgMods(),
    );
    expect(plain(result.append)).toEqual([]);
    expect(plain(result.skipped)).toEqual([
      {
        id: 'acme-audit@acme-tools',
        reason:
          'appendPlugins names acme-audit@acme-tools, which is not an enabled managed plugin with a hooks module; skipped',
      },
    ]);
  });

  test('appendPlugins in project, local and --settings files is ignored', () => {
    for (const scope of ['project', 'local', 'flag'] as const) {
      const result = order([[scope, { appendPlugins: ['mine@dev'] }]], bareMachine);
      expect(plain(result.append)).toEqual([]);
    }
  });

  test('user settings order the user’s own mods only on a machine with no managed settings and no Team or Enterprise login', () => {
    const user: Source = ['user', { appendPlugins: ['mine@dev'] }];
    expect(plain(order([user], bareMachine).append)).toEqual(['mine@dev']);
    expect(plain(order([user], managedMachine).append)).toEqual([]);
    expect(plain(order([user], teamLogin).append)).toEqual([]);
  });

  test('prependPlugins and appendPlugins are read from the same source rule', () => {
    const result = order(
      [['user', { prependPlugins: ['first@dev'], appendPlugins: ['last@dev'] }]],
      bareMachine,
    );
    expect(plain(result.prepend)).toEqual(['first@dev']);
    expect(plain(result.append)).toEqual(['last@dev']);
  });
});

describe('what the docs leave open (spec/judgments.md)', () => {
  test('a repeated id keeps its first place', () => {
    const result = order(
      [
        acme({
          prependPlugins: [
            'acme-guard@acme-tools',
            'acme-audit@acme-tools',
            'acme-guard@acme-tools',
          ],
        }),
      ],
      managedMachine,
    );
    expect(plain(result.prepend)).toEqual(['acme-guard@acme-tools', 'acme-audit@acme-tools']);
  });

  test('the two spellings of the guard are one id: a repeat or an overlap with appendPlugins counts once', () => {
    const result = order(
      [acme({ prependPlugins: ['sec-default@builtin', 'cc-plugin-sec-default@builtin'] })],
      managedMachine,
    );
    expect(plain(result.prepend)).toEqual(['sec-default@builtin']);
  });

  test('a text that is no plugin id is skipped with the reason', () => {
    const result = order([['user', { prependPlugins: ['not-an-id'] }]], bareMachine);
    expect(plain(result.prepend)).toEqual([]);
    expect(plain(result.skipped)).toEqual([
      {
        id: 'not-an-id',
        reason:
          'prependPlugins names not-an-id, which is not a plugin-name@marketplace-name id; skipped',
      },
    ]);
  });

  test('a managed layer present counts as managed settings even when the host says there are none', () => {
    const result = order(
      [
        ['managed', {}],
        ['user', { prependPlugins: ['mine@dev'] }],
      ],
      bareMachine,
    );
    expect(plain(result.prepend)).toEqual([]);
    expect(result.guard.loads).toBe(true);
  });

  test('a guard id in a user list is skipped, since a user list cannot add the guard', () => {
    const result = order([['user', { prependPlugins: ['sec-default@builtin'] }]], bareMachine);
    expect(plain(result.prepend)).toEqual([]);
    expect(skippedIds(result)).toEqual(['sec-default@builtin']);
  });
});

describe('both keys', () => {
  test('no list is no order', () => {
    const result = order([], managedMachine);
    expect(plain([result.prepend, result.append, result.skipped])).toEqual([[], [], []]);
  });
});
