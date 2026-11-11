/**
 * The host's own skills (`SessionOptions.hostSkills`): Claude Code's bundled skills are the skills a
 * host supplies itself (skills.md, "Bundled skills": "You invoke a bundled skill the same way as any
 * other skill"), so a host skill goes through the same catalog, listing, menu, lookup, mentions,
 * preload and `checkInvocation` as every other, under the rules the docs give bundled skills:
 * skills.md, "Resolve skills that share a name" and "When a synced skill name matches another
 * command"; "Remove a skill" (`disableBundledSkills`, `skillOverrides`); settings-reference.md,
 * `disableSkillShellExecution` ("Bundled skills ... are unaffected"), `allowManagedPermissionRulesOnly`
 * ("bundled skills keep their `allowed-tools`") and `strictPluginOnlyCustomization` ("It keeps loading
 * bundled skills"). The input's shape, its order after the folders and the run-time list are
 * judgments (spec/judgments.md).
 */
import { describe, expect, test } from 'bun:test';
import type { HostSkill, PluginSession } from '../../src/host/index.ts';
import { createPolicyView } from '../../src/settings/index.ts';
import { loaded, signal } from '../support/host.ts';
import { layerOf } from '../support/settings-layers.ts';
import { HOME, folderHostOf, menuOf, skillText } from '../support/scan.ts';
import { spec } from '../support/spec.ts';

const REVIEW: HostSkill = {
  name: 'review',
  frontmatter: { description: 'Review the change', keywords: ['pr'] },
  body: 'Review $ARGUMENTS carefully.',
};

const personal = (name: string) => `${HOME}/.claude/skills/${name}/SKILL.md`;
const synced = (name: string) => `${HOME}/.claude/skills/synced/${name}/SKILL.md`;

type Fixture = Parameters<typeof folderHostOf>[1];

async function sessionOf(
  skills: readonly HostSkill[],
  files: Record<string, string> = {},
  fixture: Fixture = {},
) {
  const host = folderHostOf(files, {
    ...fixture,
    session: { ...fixture?.session, hostSkills: () => skills },
  });
  await host.session.reloadSkills({ signal: signal() });
  return host;
}

const rowOf = (session: PluginSession, command: string) =>
  session.skillCatalog().skills.find((row) => row.invocable.command === command);

const expand = (session: PluginSession, name: string, args = '') =>
  session.expandSkill(name, { arguments: args, signal: signal() });

const managed = (settings: Record<string, unknown>) =>
  createPolicyView([layerOf('managed', settings)]);

describe('a host skill is a skill of the session', () => {
  test('listed, in the menu, found by name and expanded from its body', async () => {
    const { session } = await sessionOf([REVIEW]);
    const row = rowOf(session, 'review');
    expect(row?.source).toEqual({ kind: 'host' });
    expect(row?.invocable).toMatchObject({
      kind: 'command',
      description: 'Review the change',
      origin: { kind: 'bundled' },
      frontmatter: { description: 'Review the change', keywords: ['pr'] },
    });
    expect(menuOf(session)).toEqual(['review']);
    expect(session.skills().model.entries.map((entry) => entry.name)).toEqual(['review']);
    const expansion = await expand(session, 'review', 'src/');
    expect(expansion.ok && expansion.text).toBe('Review src/ carefully.');
  });

  test('its frontmatter is read by the kit: `disable-model-invocation` keeps it from the model', async () => {
    const { session } = await sessionOf([
      { name: 'ship', frontmatter: { 'disable-model-invocation': true }, body: 'Ship.' },
    ]);
    expect(rowOf(session, 'ship')?.policy).toMatchObject({ user: true, model: false });
    const byModel = await session.expandSkill('ship', { invoker: 'model', signal: signal() });
    expect(byModel.ok).toBe(false);
  });

  test('a reader body is read at each expansion; `undefined` fails it as a skill that is gone', async () => {
    let text: string | undefined = 'First.';
    const { session } = await sessionOf([
      { name: 'live', body: () => Promise.resolve(text), frontmatter: { description: 'L' } },
    ]);
    expect(await expand(session, 'live')).toMatchObject({ ok: true, text: 'First.' });
    text = 'Second.';
    expect(await expand(session, 'live')).toMatchObject({ ok: true, text: 'Second.' });
    text = undefined;
    expect((await expand(session, 'live')).ok).toBe(false);
  });

  test('with a file, it is a skill: its folder is the row directory and `${CLAUDE_SKILL_DIR}`', async () => {
    const { session } = await sessionOf([
      { ...REVIEW, file: '/opt/host/skills/review/SKILL.md', body: 'Run ${CLAUDE_SKILL_DIR}/x.sh' },
    ]);
    const row = rowOf(session, 'review');
    expect(row).toMatchObject({
      file: '/opt/host/skills/review/SKILL.md',
      directory: '/opt/host/skills/review',
    });
    expect(row?.invocable.kind).toBe('skill');
    const expansion = await expand(session, 'review');
    expect(expansion.ok && expansion.text).toBe(
      'Base directory for this skill: /opt/host/skills/review\n\nRun /opt/host/skills/review/x.sh',
    );
  });

  test('mentions, preload and the plugins’ bare names see it', async () => {
    const plugin = await loaded({
      '.claude-plugin/plugin.json': JSON.stringify({ name: 'kit', skills: ['./extra/r'] }),
      'extra/r/SKILL.md': skillText('Plugin review', 'name: review'),
    });
    const { session } = await sessionOf([REVIEW], {}, { plugins: [{ id: 'kit@a', plugin }] });
    expect(rowOf(session, 'kit:review')?.names).toEqual(['kit:review']);
    expect(session.messageMentions('/review now').leading).toEqual(['review']);
    const preloaded = await session.preloadSkills({ skills: ['review'] }, { signal: signal() });
    expect(preloaded.preloaded.map((skill) => skill.body)).toEqual([
      'Review $ARGUMENTS carefully.',
    ]);
  });

  test('a list the host changes at run time is read at the next call', async () => {
    let skills: readonly HostSkill[] = [];
    const { session } = folderHostOf({}, { session: { hostSkills: () => skills } });
    await session.reloadSkills({ signal: signal() });
    expect(menuOf(session)).toEqual([]);
    skills = [REVIEW];
    expect(menuOf(session)).toEqual(['review']);
    expect((await expand(session, 'review')).ok).toBe(true);
  });

  test('a refused name is an issue and no row; a second skill of one name is an issue', async () => {
    const { session } = await sessionOf([
      { name: 'anthropic-skills:pdf', body: 'x' },
      REVIEW,
      { ...REVIEW, body: 'Other.' },
    ]);
    const catalog = session.skillCatalog();
    expect(catalog.skills.map((row) => row.invocable.command)).toEqual(['review']);
    expect(catalog.issues.map((issue) => issue.path)).toEqual([
      'hostSkills.anthropic-skills:pdf',
      'hostSkills.review',
    ]);
    expect(session.skills().issues).toEqual(catalog.issues);
    const kept = await expand(session, 'review', 'it');
    expect(kept.ok && kept.text).toBe('Review it carefully.');
  });
});

describe('the rules of a bundled skill', () => {
  spec(
    'skills.behavior.Resolve skills that share a name.Any of those locations and a bundled skill',
    () => {
      test('a personal skill of its name replaces it', async () => {
        const { session } = await sessionOf([REVIEW], { [personal('review')]: skillText('Mine') });
        expect(rowOf(session, 'review')?.source).toEqual({ kind: 'folder', scope: 'user' });
        expect(session.skillCatalog().skills).toHaveLength(1);
        const expansion = await expand(session, 'review');
        expect(expansion.ok && expansion.text).toContain('Do the Mine work.');
      });
    },
  );

  spec(
    'skills.behavior.Resolve skills that share a name.Any of the above and the short name of a skill synced from your claude.ai account',
    () => {
      test('a synced skill of its name keeps only its full name', async () => {
        const { session } = await sessionOf([REVIEW], { [synced('review')]: skillText('Synced') });
        expect(rowOf(session, 'review')?.source).toEqual({ kind: 'host' });
        expect(rowOf(session, 'anthropic-skills:review')?.source).toEqual({
          kind: 'folder',
          scope: 'synced',
        });
      });
    },
  );

  spec('skills.behavior.Remove a skill.Bundled skill', () => {
    test('`disableBundledSkills` or its variable removes it; a synced skill still yields the name', async () => {
      const files = { [synced('review')]: skillText('Synced') };
      const { session } = await sessionOf([REVIEW], files, {
        settings: managed({ disableBundledSkills: true }),
      });
      expect(rowOf(session, 'review')).toBeUndefined();
      expect(rowOf(session, 'anthropic-skills:review')).toBeDefined();
      expect((await expand(session, 'review')).ok).toBe(false);
      const byEnv = await sessionOf(
        [REVIEW],
        {},
        { env: { CLAUDE_CODE_DISABLE_BUNDLED_SKILLS: '1' } },
      );
      expect(byEnv.session.skillCatalog().skills).toEqual([]);
    });

    test('`skillOverrides` set to off hides it', async () => {
      const settings = createPolicyView([layerOf('user', { skillOverrides: { review: 'off' } })]);
      const { session } = await sessionOf([REVIEW], {}, { settings });
      expect(rowOf(session, 'review')).toMatchObject({ override: 'off', listed: 'hidden' });
      expect(menuOf(session)).toEqual([]);
    });
  });

  spec('settings.key.disableSkillShellExecution', () => {
    test('its injected commands still run', async () => {
      const { session, runner } = await sessionOf(
        [{ name: 'branch', body: 'On !`git branch --show-current`' }],
        {},
        {
          settings: managed({ disableSkillShellExecution: true }),
          runs: [{ stdout: 'main\n' }],
          session: { shellPermission: () => 'allow' },
        },
      );
      const expansion = await expand(session, 'branch');
      expect(expansion.ok && expansion.text).toBe('On main');
      expect(runner.calls).toHaveLength(1);
    });
  });

  spec('permissions.setting.allowManagedPermissionRulesOnly', () => {
    test('it keeps its `allowed-tools`', async () => {
      const { session } = await sessionOf(
        [{ name: 'read', frontmatter: { 'allowed-tools': 'Read' }, body: 'Read.' }],
        {},
        { settings: managed({ allowManagedPermissionRulesOnly: true }) },
      );
      expect(await expand(session, 'read')).toMatchObject({ ok: true, grants: ['Read'] });
    });
  });

  spec('settings.key.strictPluginOnlyCustomization.skills', () => {
    test('the skills lock keeps it', async () => {
      const { session } = await sessionOf(
        [REVIEW],
        { [personal('mine')]: skillText('Mine') },
        {
          settings: managed({ strictPluginOnlyCustomization: ['skills'] }),
        },
      );
      expect(menuOf(session)).toEqual(['review']);
    });
  });
});
