/**
 * settings-reference.md § `skillOverrides` (Scope "Any file"; the four states; "Overrides don't apply
 * to plugin skills"; a key on a bundled skill's alias in managed settings and `--settings` files),
 * skills.md § "Override skill visibility from settings" (the state table; "`off` also hides the skill
 * from the command lists advertised to Remote Control clients and to Agent SDK callers"; "Invoking a
 * hidden skill by its full name returns the `skillOverrides` error instead of running it"; "A skill
 * that is absent from `skillOverrides` is treated as `on`"; "You can only restrict a skill further
 * through an alias, never make it more visible, and if you also set an entry under the skill's own
 * name in managed settings, that entry takes precedence"; "In user, project, and local settings,
 * Claude Code matches entries against skill names only"; "Plugin skills are not affected").
 */
import { describe, expect, test } from 'bun:test';
import { skillVisibility } from '../../../src/settings/skills/index.ts';
import { viewOf, type Source } from '../../support/plugin-settings.ts';
import { issuesOf, plain } from '../../support/settings-layers.ts';
import { spec } from '../../support/spec.ts';

const overrides = (entries: Record<string, string>) => ({ skillOverrides: entries });
const only = (name: string, state: string) => overrides({ [name]: state });
const seen = (...sources: Source[]) => skillVisibility(viewOf(...sources), 'deploy');

spec('settings.key.skillOverrides', () => {
  test('on: Claude sees the name and description and the skill is in the / menu', () => {
    expect(plain(seen(['user', only('deploy', 'on')]))).toMatchObject({
      listedToModel: 'full',
      inSlashMenu: true,
      invokableByFullName: true,
    });
  });

  test('name-only: Claude sees the name without the description, the / menu keeps it', () => {
    expect(plain(seen(['user', only('deploy', 'name-only')]))).toMatchObject({
      listedToModel: 'nameOnly',
      inSlashMenu: true,
      invokableByFullName: true,
    });
  });

  test('user-invocable-only: hidden from Claude, still typable as /name', () => {
    expect(plain(seen(['user', only('deploy', 'user-invocable-only')]))).toMatchObject({
      listedToModel: 'hidden',
      inSlashMenu: true,
      invokableByFullName: true,
    });
  });

  test('off: hidden from Claude and from / autocomplete', () => {
    expect(plain(seen(['user', only('deploy', 'off')]))).toMatchObject({
      listedToModel: 'hidden',
      inSlashMenu: false,
    });
  });

  test('off also hides the skill from the Remote Control and Agent SDK command lists', () => {
    expect(seen(['user', only('deploy', 'off')]).inClientCommandLists).toBe(false);
  });

  test('invoking an off skill by its full name returns the skillOverrides error instead of running it', () => {
    const off = seen(['user', only('deploy', 'off')]);
    expect(off.invokableByFullName).toBe(false);
    expect(off.blockedBy).toBe('skillOverrides');
  });

  test('a skill absent from skillOverrides is on', () => {
    for (const view of [[], [['user', overrides({ other: 'off' })]]] as const) {
      expect(plain(seen(...view))).toEqual({
        listedToModel: 'full',
        inSlashMenu: true,
        inClientCommandLists: true,
        invokableByFullName: true,
        blockedBy: undefined,
      });
    }
  });

  test("the docs' example: legacy-context by name only, deploy off", () => {
    const view = viewOf(['user', overrides({ 'legacy-context': 'name-only', deploy: 'off' })]);
    expect(skillVisibility(view, 'legacy-context').listedToModel).toBe('nameOnly');
    expect(skillVisibility(view, 'deploy').listedToModel).toBe('hidden');
    expect(skillVisibility(view, 'deploy').inSlashMenu).toBe(false);
  });

  test('any file sets an override: user, project, local, --settings and managed', () => {
    for (const scope of ['user', 'project', 'local', 'flag', 'managed'] as const) {
      expect(seen([scope, only('deploy', 'off')]).listedToModel).toBe('hidden');
    }
  });

  test('a plugin skill is not affected, even under its own name', () => {
    const view = viewOf(['managed', overrides({ deploy: 'off', 'formatter:deploy': 'off' })]);
    expect(skillVisibility(view, 'deploy', { plugin: true }).listedToModel).toBe('full');
    expect(skillVisibility(view, 'formatter:deploy', { plugin: true }).inSlashMenu).toBe(true);
  });

  test('an unknown state is dropped with a warning and the skill stays on', () => {
    const raw = only('deploy', 'hidden');
    expect(issuesOf('user', raw).length).toBeGreaterThan(0);
    expect(seen(['user', raw]).listedToModel).toBe('full');
  });
});

describe('aliases of a bundled skill', () => {
  const doctor = { aliases: ['checkup'] };
  const ofDoctor = (...sources: Source[]) => skillVisibility(viewOf(...sources), 'doctor', doctor);

  spec('settings.key.skillOverrides', () => {
    test('an entry under an alias in managed settings applies to the skill behind it', () => {
      expect(ofDoctor(['managed', only('checkup', 'off')]).inSlashMenu).toBe(false);
    });

    test('an entry under an alias in a --settings file applies to the skill behind it', () => {
      expect(ofDoctor(['flag', only('checkup', 'user-invocable-only')]).listedToModel).toBe(
        'hidden',
      );
    });

    test('in user, project and local settings an entry matches skill names only', () => {
      for (const scope of ['user', 'project', 'local'] as const) {
        expect(ofDoctor([scope, only('checkup', 'off')]).listedToModel).toBe('full');
      }
    });

    test('an alias entry for review does not reach /code-review from a user file', () => {
      const view = viewOf(['user', only('review', 'off')]);
      expect(skillVisibility(view, 'code-review', { aliases: ['review'] }).listedToModel).toBe(
        'full',
      );
      expect(skillVisibility(view, 'review').listedToModel).toBe('hidden');
    });

    test('an alias can only restrict further, never make a skill more visible', () => {
      const restricted = ofDoctor(
        ['managed', only('checkup', 'on')],
        ['user', only('doctor', 'off')],
      );
      expect(restricted.inSlashMenu).toBe(false);
      const stricter = ofDoctor(
        ['managed', only('checkup', 'name-only')],
        ['user', only('doctor', 'user-invocable-only')],
      );
      expect(stricter.listedToModel).toBe('hidden');
      const looser = ofDoctor(
        ['managed', only('checkup', 'user-invocable-only')],
        ['user', only('doctor', 'name-only')],
      );
      expect(looser.listedToModel).toBe('hidden');
    });

    test("an entry under the skill's own name in managed settings takes precedence over an alias entry", () => {
      const visible = ofDoctor(['managed', overrides({ doctor: 'on', checkup: 'off' })]);
      expect(visible.listedToModel).toBe('full');
      expect(visible.inSlashMenu).toBe(true);
    });
  });
});

const strictLadder = (state: string, own: string) =>
  skillVisibility(
    viewOf(['managed', only('checkup', state)], ['user', only('doctor', own)]),
    'doctor',
    { aliases: ['checkup'] },
  ).listedToModel;

describe('what the docs leave open (spec/judgments.md)', () => {
  test('per skill name the highest file wins, whole', () => {
    expect(
      seen(['user', only('deploy', 'off')], ['local', only('deploy', 'name-only')]),
    ).toMatchObject({
      listedToModel: 'nameOnly',
      inSlashMenu: true,
    });
    expect(
      seen(['managed', only('deploy', 'off')], ['local', only('deploy', 'on')]).inSlashMenu,
    ).toBe(false);
  });

  test('entries for different names combine across files', () => {
    const view = viewOf(['user', only('a', 'off')], ['project', only('b', 'name-only')]);
    expect(skillVisibility(view, 'a').listedToModel).toBe('hidden');
    expect(skillVisibility(view, 'b').listedToModel).toBe('nameOnly');
  });

  test('the alias strictness ladder is the order of the four states', () => {
    expect(strictLadder('on', 'name-only')).toBe('nameOnly');
    expect(strictLadder('name-only', 'on')).toBe('nameOnly');
  });

  test('a user-invocable-only skill stays in the client command lists, as in the / menu', () => {
    expect(seen(['user', only('deploy', 'user-invocable-only')]).inClientCommandLists).toBe(true);
  });

  test('several aliases: the strictest entry applies', () => {
    const view = viewOf(['managed', overrides({ a: 'name-only', b: 'off' })]);
    expect(skillVisibility(view, 'real', { aliases: ['a', 'b'] }).inSlashMenu).toBe(false);
  });

  test('a prototype-looking skill name is a name like any other', () => {
    const view = viewOf(['user', JSON.parse('{"skillOverrides":{"__proto__":"off"}}')]);
    expect(skillVisibility(view, 'toString').listedToModel).toBe('full');
    expect(skillVisibility(view, '__proto__').listedToModel).toBe('hidden');
  });
});
