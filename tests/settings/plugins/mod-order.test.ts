/**
 * settings-reference.md § `prependPlugins` and § `appendPlugins` (managed plugins whose mods run
 * before or after every mod a user installs, "in the listed order"; "An id listed in both ... is
 * prepended"; "In managed settings, Claude Code skips an id whose plugin doesn't count as your
 * organization's"; Scope: User or managed, read from user settings "only on a machine with no managed
 * settings, in a session whose credential isn't a Team or Enterprise `/login`" and ignored in project
 * and local settings and in a `--settings` file; "name `sec-default@builtin` in the list to keep the
 * built-in guard"), plugins/mods/admin.md § "Install your organization's mods and set the order" (the
 * rules that decide which ids take effect, the quoted debug line, a user list "neither adds nor
 * removes the built-in guard") and § "Know what happens by default" (when the guard loads),
 * plugins/mods/reference.md § `sec-default@builtin` ("If managed `prependPlugins` is set, the guard
 * loads only when that list names it, at the position listed").
 */
import { expect, test } from 'bun:test';
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

spec('settings.key.prependPlugins', () => {
  test('the docs example puts acme-guard first and the built-in guard second, in the listed order', () => {
    const result = order(
      [acme({ prependPlugins: ['acme-guard@acme-tools', 'sec-default@builtin'] })],
      managedMachine,
    );
    expect(plain(result.prepend)).toEqual(['acme-guard@acme-tools', 'sec-default@builtin']);
    expect(result.skipped).toEqual([]);
    expect(result.guard).toEqual({ loads: true, placement: 'listed' });
  });

  test('the listed order is the order, whatever the order of the ids in enabledPlugins', () => {
    const result = order(
      [acme({ prependPlugins: ['acme-audit@acme-tools', 'acme-guard@acme-tools'] })],
      managedMachine,
    );
    expect(plain(result.prepend)).toEqual(['acme-audit@acme-tools', 'acme-guard@acme-tools']);
  });

  test('the built-in guard is named as sec-default@builtin or as cc-plugin-sec-default@builtin', () => {
    for (const id of ['sec-default@builtin', 'cc-plugin-sec-default@builtin']) {
      const result = order([acme({ prependPlugins: [id] })], managedMachine);
      expect(plain(result.prepend)).toEqual([id]);
      expect(result.guard.loads).toBe(true);
    }
  });

  test('in managed settings an id that is not an enabled managed plugin is skipped, with the documented line', () => {
    const copied = order(
      [acme({ prependPlugins: ['acme-guard@acme-tools'] })],
      managedMachine,
      orgMods(),
    );
    expect(plain(copied.prepend)).toEqual([]);
    expect(plain(copied.skipped)).toEqual([
      {
        id: 'acme-guard@acme-tools',
        reason:
          'prependPlugins names acme-guard@acme-tools, which is not an enabled managed plugin with a hooks module; skipped',
      },
    ]);
  });

  test('an id that managed enabledPlugins does not set to true is skipped even when the host calls it an organization mod', () => {
    const result = order(
      [
        acme({
          enabledPlugins: { 'acme-guard@acme-tools': false },
          prependPlugins: ['acme-guard@acme-tools', 'ghost@acme-tools'],
        }),
        ['user', { enabledPlugins: { 'ghost@acme-tools': true } }],
      ],
      managedMachine,
      orgMods('acme-guard@acme-tools', 'ghost@acme-tools'),
    );
    expect(plain(result.prepend)).toEqual([]);
    expect(skippedIds(result)).toEqual(['acme-guard@acme-tools', 'ghost@acme-tools']);
  });

  test('a plugin with the same name from another marketplace is not the one listed', () => {
    const result = order(
      [acme({ prependPlugins: ['acme-guard@other-tools'] })],
      managedMachine,
      orgMods('acme-guard@acme-tools', 'acme-guard@other-tools'),
    );
    expect(skippedIds(result)).toEqual(['acme-guard@other-tools']);
  });

  test('setting prependPlugins in managed settings replaces the default: the guard stays only when named', () => {
    const without = order([acme({ prependPlugins: ['acme-guard@acme-tools'] })], managedMachine);
    expect(plain(without.prepend)).toEqual(['acme-guard@acme-tools']);
    expect(without.guard).toEqual({ loads: false, placement: 'absent' });
    const empty = order([acme({ prependPlugins: [] })], managedMachine);
    expect(empty.guard).toEqual({ loads: false, placement: 'absent' });
  });

  test('an organization mod that no list names is reported in unlisted, after prepend and before the users', () => {
    const result = order([acme({})], managedMachine);
    expect(plain(result.prepend)).toEqual([]);
    expect(plain(result.append)).toEqual([]);
    expect(plain(result.unlisted)).toEqual(['acme-guard@acme-tools', 'acme-audit@acme-tools']);
    expect(result.skipped).toEqual([]);
  });

  test('a listed organization mod is not unlisted, and a mod not force-enabled by managed settings is never one', () => {
    const result = order(
      [
        acme({
          prependPlugins: ['sec-default@builtin', 'acme-guard@acme-tools'],
          enabledPlugins: {
            'acme-guard@acme-tools': true,
            'acme-audit@acme-tools': true,
            'acme-off@acme-tools': false,
          },
        }),
      ],
      managedMachine,
      orgMods('acme-guard@acme-tools', 'acme-audit@acme-tools', 'acme-off@acme-tools', 'x@y'),
    );
    expect(plain(result.prepend)).toEqual(['sec-default@builtin', 'acme-guard@acme-tools']);
    expect(plain(result.unlisted)).toEqual(['acme-audit@acme-tools']);
    const appended = order([acme({ appendPlugins: ['acme-audit@acme-tools'] })], managedMachine);
    expect(plain(appended.append)).toEqual(['acme-audit@acme-tools']);
    expect(plain(appended.unlisted)).toEqual(['acme-guard@acme-tools']);
  });

  test('a guard named in appendPlugins does not keep the guard: only prependPlugins names it', () => {
    const result = order([acme({ appendPlugins: ['sec-default@builtin'] })], managedMachine);
    expect(result.guard).toEqual({ loads: true, placement: 'outermost' });
    expect(plain(result.append)).toEqual([]);
    expect(plain(result.skipped)).toEqual([
      {
        id: 'sec-default@builtin',
        reason:
          'appendPlugins names sec-default@builtin, which is not an enabled managed plugin with a hooks module; skipped',
      },
    ]);
    const listed = order(
      [acme({ prependPlugins: ['acme-guard@acme-tools'], appendPlugins: ['sec-default@builtin'] })],
      managedMachine,
    );
    expect(listed.guard.loads).toBe(false);
  });

  test('without the key the guard seats itself outermost on a machine with managed settings', () => {
    const result = order([acme({})], managedMachine);
    expect(result.guard).toEqual({ loads: true, placement: 'outermost' });
    expect(plain(result.prepend)).toEqual([]);
  });

  test('the guard also loads on a Team or Enterprise login, and nowhere else', () => {
    expect(order([], teamLogin).guard).toEqual({ loads: true, placement: 'outermost' });
    expect(order([], bareMachine).guard).toEqual({ loads: false, placement: 'absent' });
    const personal = order([], { hasManagedSettings: false, account: 'claudeaiPersonal' });
    expect(personal.guard.loads).toBe(false);
  });

  test('prependPlugins in project, local and --settings files is ignored', () => {
    for (const scope of ['project', 'local', 'flag'] as const) {
      const result = order(
        [[scope, { prependPlugins: ['mine@dev'] }]],
        bareMachine,
        orgMods('mine@dev'),
      );
      expect(plain(result.prepend)).toEqual([]);
      expect(result.skipped).toEqual([]);
    }
  });

  test('user settings order the user’s own mods only on a machine with no managed settings and no Team or Enterprise login', () => {
    const user: Source = ['user', { prependPlugins: ['mine@dev'] }];
    expect(plain(order([user], bareMachine).prepend)).toEqual(['mine@dev']);
    expect(plain(order([user], managedMachine).prepend)).toEqual([]);
    expect(plain(order([user], teamLogin).prepend)).toEqual([]);
    expect(plain(order([user, ['managed', {}]], bareMachine).prepend)).toEqual([]);
  });

  test('a user list needs no enabledPlugins entry and no organization mod, and never touches the guard', () => {
    const result = order(
      [['user', { prependPlugins: ['mine@dev', 'sec-default@builtin'] }]],
      bareMachine,
      orgMods(),
    );
    expect(plain(result.prepend)).toEqual(['mine@dev']);
    expect(result.guard).toEqual({ loads: false, placement: 'absent' });
  });

  test('managed settings win over user settings, which are then ignored whole', () => {
    const result = order(
      [
        acme({ prependPlugins: ['acme-guard@acme-tools', 'sec-default@builtin'] }),
        ['user', { prependPlugins: ['mine@dev'] }],
      ],
      bareMachine,
    );
    expect(plain(result.prepend)).toEqual(['acme-guard@acme-tools', 'sec-default@builtin']);
  });
});
