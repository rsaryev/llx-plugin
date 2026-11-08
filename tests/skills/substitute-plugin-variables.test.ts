/**
 * skills.md § Available string substitutions: `${CLAUDE_PLUGIN_ROOT}` ("the plugin's installation
 * directory. Substituted only in plugin skills") and `${CLAUDE_PLUGIN_DATA}` ("the plugin's
 * persistent data directory ... Substituted only in plugin skills"), in the skill's content and in
 * the Bash rules of `allowed-tools` ("In a plugin skill, Claude Code substitutes
 * `${CLAUDE_PLUGIN_ROOT}` and `${CLAUDE_PLUGIN_DATA}` in the same two places"); "a backslash
 * doesn't prevent substitution of a `${CLAUDE_*}` variable". The data folder is created when first
 * referenced (plugins/components.md, "Path variables and persistent data"), so the host is asked
 * only then.
 */
import { expect, test } from 'bun:test';
import { buildVariables, substituteVariables } from '../../src/skills/variables.ts';
import { fakeEnvironment, locations } from '../support/ports.ts';
import { expand, PLUGIN, SESSION, skillOf } from '../support/skill-variables.ts';
import { spec } from '../support/spec.ts';

spec('skills.substitution.${CLAUDE_PLUGIN_ROOT}', () => {
  test('in a plugin skill it is the plugin folder, to reach files shared between its skills', async () => {
    expect(await expand(skillOf(PLUGIN), '${CLAUDE_PLUGIN_ROOT}/shared/lint.sh')).toBe(
      '/plugins/my-plugin/shared/lint.sh',
    );
  });

  test('asks Locations for the plugin by the id the host gave', async () => {
    expect(
      await expand(skillOf(PLUGIN), '${CLAUDE_PLUGIN_ROOT}', { pluginId: 'my-plugin@acme' }),
    ).toBe('/plugins/my-plugin@acme');
  });

  test('is substituted in a Bash rule of allowed-tools of a plugin skill', async () => {
    const skill = skillOf(PLUGIN, 'allowed-tools: Bash(${CLAUDE_PLUGIN_ROOT}/bin/fmt *)\n');
    expect(await expand(skill, skill.allowedTools[0] ?? '')).toBe(
      'Bash(/plugins/my-plugin/bin/fmt *)',
    );
  });

  test('stays as written in a user, a project and a synced skill', async () => {
    for (const origin of [{ kind: 'user' }, { kind: 'project' }, { kind: 'synced' }] as const) {
      const text = '${CLAUDE_PLUGIN_ROOT}/x ${CLAUDE_PLUGIN_ROOT:-d}';
      expect(await expand(skillOf(origin), text, { isolatedSession: true })).toBe(text);
    }
  });

  test('a literal reference does not disturb the substitution around it', async () => {
    expect(
      await expand(
        skillOf({ kind: 'project' }),
        'a ${CLAUDE_PLUGIN_ROOT} b ${CLAUDE_SKILL_DIR} c ${CLAUDE_PLUGIN_ROOT} d',
      ),
    ).toBe(
      'a ${CLAUDE_PLUGIN_ROOT} b /work/app/.claude/skills/render-chart c ${CLAUDE_PLUGIN_ROOT} d',
    );
  });

  test('a backslash does not prevent it', async () => {
    expect(await expand(skillOf(PLUGIN), '\\${CLAUDE_PLUGIN_ROOT}')).toBe('\\/plugins/my-plugin');
  });
});

spec('skills.substitution.${CLAUDE_PLUGIN_DATA}', () => {
  test('in a plugin skill it is the persistent data folder of the plugin', async () => {
    expect(await expand(skillOf(PLUGIN), '${CLAUDE_PLUGIN_DATA}/node_modules')).toBe(
      '/data/my-plugin/node_modules',
    );
  });

  test('the folder is asked of the host by the sanitized id, and only when referenced', async () => {
    const fake = locations();
    const skill = skillOf(PLUGIN);
    const vars = buildVariables(
      skill,
      { ...SESSION, pluginId: 'my-plugin@acme' },
      {
        locations: fake,
        environment: fakeEnvironment(),
      },
    );
    await substituteVariables('no data folder here ${CLAUDE_PLUGIN_ROOT}', vars);
    expect(fake.dataCreated).toEqual([]);
    expect((await substituteVariables('${CLAUDE_PLUGIN_DATA}', vars)).text).toBe(
      '/data/my-plugin-acme',
    );
    expect(fake.dataCreated).toEqual(['my-plugin-acme']);
  });

  test('is substituted in a Bash rule of allowed-tools of a plugin skill', async () => {
    const skill = skillOf(PLUGIN, 'allowed-tools: Bash(${CLAUDE_PLUGIN_DATA}/venv/bin/python *)\n');
    expect(await expand(skill, skill.allowedTools[0] ?? '')).toBe(
      'Bash(/data/my-plugin/venv/bin/python *)',
    );
  });

  test('stays as written, and the host is never asked for a folder, in a non-plugin skill', async () => {
    for (const origin of [{ kind: 'user' }, { kind: 'project' }, { kind: 'synced' }] as const) {
      const fake = locations();
      const vars = buildVariables(skillOf(origin), SESSION, {
        locations: fake,
        environment: fakeEnvironment(),
      });
      const text = 'at ${CLAUDE_PLUGIN_DATA}/x';
      expect((await substituteVariables(text, vars)).text).toBe(text);
      expect(fake.dataCreated).toEqual([]);
    }
  });

  test('a backslash does not prevent it', async () => {
    expect(await expand(skillOf(PLUGIN), '\\${CLAUDE_PLUGIN_DATA}')).toBe('\\/data/my-plugin');
  });
});
