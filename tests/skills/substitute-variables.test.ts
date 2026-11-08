/**
 * skills.md § Available string substitutions: `${CLAUDE_SESSION_ID}`, `${CLAUDE_EFFORT}`,
 * `${CLAUDE_SKILL_DIR}` ("the skill's subdirectory within the plugin, not the plugin root"),
 * `${CLAUDE_PROJECT_DIR}`, `${CLAUDE_PLUGIN_ROOT}` and `${CLAUDE_PLUGIN_DATA}` ("Substituted only
 * in plugin skills"). "Claude Code substitutes `${CLAUDE_SKILL_DIR}` and `${CLAUDE_PROJECT_DIR}`
 * in two places: the skill's markdown content, and Bash rules in the `allowed-tools`
 * frontmatter. In a plugin skill, ... `${CLAUDE_PLUGIN_ROOT}` and `${CLAUDE_PLUGIN_DATA}` in the
 * same two places", and "a backslash doesn't prevent substitution of a `${CLAUDE_*}` variable".
 * § How Claude Code handles the body of a synced skill: in a session on the owner's machine the
 * `${CLAUDE_PROJECT_DIR}` and `${CLAUDE_SESSION_ID}` placeholders "reach Claude as literal text".
 * The rule match of `allowed-tools` against the command is proven end to end with the expansion.
 */
import { describe, expect, test } from 'bun:test';
import { readSkill } from '../../src/format/skill.ts';
import { EFFORT_LEVELS } from '../../src/protocol/effort.ts';
import { substitute } from '../../src/skills/substitute.ts';
import { buildVariables, substituteVariables } from '../../src/skills/variables.ts';
import { fakeEnvironment, locations } from '../support/ports.ts';
import { expand, ORIGINS, PLUGIN, SESSION, skillOf } from '../support/skill-variables.ts';
import { spec } from '../support/spec.ts';

spec('skills.substitution.${CLAUDE_SESSION_ID}', () => {
  test('the docs example: logs/${CLAUDE_SESSION_ID}.log carries the session', async () => {
    const body = 'Log the following to logs/${CLAUDE_SESSION_ID}.log:\n\n$ARGUMENTS';
    const skill = skillOf(PLUGIN, '', body);
    const ports = { locations: locations(), environment: fakeEnvironment() };
    const vars = buildVariables(skill, SESSION, ports);
    const { text } = await substitute(skill.body, {
      rawArguments: 'did the thing',
      names: [],
      vars,
    });
    expect(text.trim()).toBe('Log the following to logs/sess-42.log:\n\ndid the thing');
  });

  test('is substituted in a plugin, a user and a project skill', async () => {
    for (const origin of ORIGINS) {
      expect(await expand(skillOf(origin), '${CLAUDE_SESSION_ID}')).toBe('sess-42');
    }
  });

  test('every occurrence is replaced', async () => {
    expect(await expand(skillOf(PLUGIN), '${CLAUDE_SESSION_ID}/${CLAUDE_SESSION_ID}')).toBe(
      'sess-42/sess-42',
    );
  });

  test('a backslash does not prevent it', async () => {
    expect(await expand(skillOf(PLUGIN), '\\${CLAUDE_SESSION_ID} \\\\${CLAUDE_SESSION_ID}')).toBe(
      '\\sess-42 \\\\sess-42',
    );
  });

  test('a synced skill on the owner machine keeps it as literal text, an isolated session expands it', async () => {
    const synced = skillOf({ kind: 'synced' });
    expect(await expand(synced, 'id ${CLAUDE_SESSION_ID}')).toBe('id ${CLAUDE_SESSION_ID}');
    expect(await expand(synced, 'id ${CLAUDE_SESSION_ID}', { isolatedSession: true })).toBe(
      'id sess-42',
    );
  });

  test('an argument value naming it is replaced too, after the arguments are inserted', async () => {
    const skill = skillOf(PLUGIN, '', 'Note: $0');
    const ports = { locations: locations(), environment: fakeEnvironment() };
    const vars = buildVariables(skill, SESSION, ports);
    const { text } = await substitute(skill.body, {
      rawArguments: '"in ${CLAUDE_SESSION_ID}"',
      names: [],
      vars,
    });
    expect(text.trim()).toBe('Note: in sess-42');
  });
});

spec('skills.substitution.${CLAUDE_EFFORT}', () => {
  test('is the current effort level, one of low, medium, high, xhigh or max', async () => {
    expect([...EFFORT_LEVELS]).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
    for (const effort of EFFORT_LEVELS) {
      const text = await expand(skillOf(PLUGIN), 'Effort is ${CLAUDE_EFFORT}.', { effort });
      expect(text).toBe(`Effort is ${effort}.`);
    }
  });

  test('is substituted for every origin of skill', async () => {
    for (const origin of [...ORIGINS, { kind: 'synced' } as const]) {
      expect(await expand(skillOf(origin), '${CLAUDE_EFFORT}', { effort: 'max' })).toBe('max');
    }
  });

  test('a backslash does not prevent it', async () => {
    expect(await expand(skillOf(PLUGIN), '\\${CLAUDE_EFFORT}', { effort: 'low' })).toBe('\\low');
  });
});

spec('skills.substitution.${CLAUDE_SKILL_DIR}', () => {
  test('in a plugin skill it is the skill subdirectory, not the plugin root', async () => {
    const skill = skillOf(PLUGIN);
    expect(await expand(skill, '${CLAUDE_SKILL_DIR}')).toBe(
      '/plugins/my-plugin/skills/render-chart',
    );
    expect(await expand(skill, '${CLAUDE_PLUGIN_ROOT}')).toBe('/plugins/my-plugin');
  });

  test('in a project skill it is that skill folder under the project', async () => {
    expect(await expand(skillOf({ kind: 'project' }), '${CLAUDE_SKILL_DIR}/scripts/x.sh')).toBe(
      '/work/app/.claude/skills/render-chart/scripts/x.sh',
    );
  });

  test('in a user skill it is that skill folder under the home directory', async () => {
    expect(await expand(skillOf({ kind: 'user' }), '${CLAUDE_SKILL_DIR}')).toBe(
      '/home/user/.claude/skills/render-chart',
    );
  });

  test('is the same in the body and in the Bash rule of allowed-tools, the docs example', async () => {
    const skill = skillOf(
      PLUGIN,
      'allowed-tools: Bash(${CLAUDE_SKILL_DIR}/scripts/render.sh *)\n',
      'Run `${CLAUDE_SKILL_DIR}/scripts/render.sh <csv-file>` to render the chart.',
    );
    const rule = skill.allowedTools[0] ?? '';
    expect(rule).toBe('Bash(${CLAUDE_SKILL_DIR}/scripts/render.sh *)');
    expect(await expand(skill, rule)).toBe(
      'Bash(/plugins/my-plugin/skills/render-chart/scripts/render.sh *)',
    );
    expect(await expand(skill, skill.body)).toContain(
      '`/plugins/my-plugin/skills/render-chart/scripts/render.sh <csv-file>`',
    );
  });

  test('is read through the Locations port, and a skill root of the host wins', async () => {
    const skill = skillOf({ kind: 'project' });
    expect(await expand(skill, '${CLAUDE_SKILL_DIR}', { skillRoot: '/extra/dir' })).toBe(
      '/extra/dir/.claude/skills/render-chart',
    );
  });

  test('a backslash does not prevent it', async () => {
    expect(await expand(skillOf(PLUGIN), '\\${CLAUDE_SKILL_DIR}')).toBe(
      '\\/plugins/my-plugin/skills/render-chart',
    );
  });
});

spec('skills.substitution.${CLAUDE_PROJECT_DIR}', () => {
  test('is the project root, for a plugin, a user and a project skill', async () => {
    for (const origin of ORIGINS) {
      expect(await expand(skillOf(origin), '${CLAUDE_PROJECT_DIR}/.claude/hooks/helper.sh')).toBe(
        '/work/app/.claude/hooks/helper.sh',
      );
    }
  });

  test('is the path the Locations port reports as the project folder', async () => {
    const ports = {
      locations: locations({ project: '/srv/other' }),
      environment: fakeEnvironment(),
    };
    const vars = buildVariables(skillOf(PLUGIN), SESSION, ports);
    expect((await substituteVariables('${CLAUDE_PROJECT_DIR}', vars)).text).toBe('/srv/other');
  });

  test('is substituted in a Bash rule of allowed-tools too', async () => {
    const skill = skillOf(
      { kind: 'project' },
      'allowed-tools: Bash(${CLAUDE_PROJECT_DIR}/scripts/check.sh *)\n',
    );
    expect(await expand(skill, skill.allowedTools[0] ?? '')).toBe(
      'Bash(/work/app/scripts/check.sh *)',
    );
  });

  test('a synced skill on the owner machine keeps it as literal text, an isolated session expands it', async () => {
    const synced = skillOf({ kind: 'synced' });
    expect(await expand(synced, '${CLAUDE_PROJECT_DIR}/a')).toBe('${CLAUDE_PROJECT_DIR}/a');
    expect(await expand(synced, '${CLAUDE_PROJECT_DIR}/a', { isolatedSession: true })).toBe(
      '/work/app/a',
    );
  });

  test('a backslash does not prevent it', async () => {
    expect(await expand(skillOf(PLUGIN), '\\${CLAUDE_PROJECT_DIR}')).toBe('\\/work/app');
  });
});

describe('what the docs leave open (judgments)', () => {
  test('${CLAUDE_EFFORT} stays as written when the host passes no effort', async () => {
    const ports = { locations: locations(), environment: fakeEnvironment() };
    const vars = buildVariables(skillOf(PLUGIN), { sessionId: 'sess-42' }, ports);
    expect((await substituteVariables('e=${CLAUDE_EFFORT}', vars)).text).toBe('e=${CLAUDE_EFFORT}');
  });

  test('a command file has no skill folder, so ${CLAUDE_SKILL_DIR} stays as written there', async () => {
    const command = { origin: PLUGIN };
    expect(await expand(command, '${CLAUDE_SKILL_DIR}/x ${CLAUDE_PLUGIN_ROOT}')).toBe(
      '${CLAUDE_SKILL_DIR}/x /plugins/my-plugin',
    );
  });

  test('a plugin root SKILL.md has the plugin folder as its skill directory', async () => {
    const root = readSkill('SKILL.md', '---\ndescription: d\n---\nGo', {
      origin: { kind: 'plugin', plugin: 'my-plugin', rootSkill: true },
      dirName: 'my-plugin',
    }).skill;
    expect(await expand(root, '${CLAUDE_SKILL_DIR}')).toBe('/plugins/my-plugin');
  });

  test('a folder the host gave as an absolute path is used as it is', async () => {
    const absolute = { origin: { kind: 'project' } as const, dir: '/abs/skills/x' };
    expect(await expand(absolute, '${CLAUDE_SKILL_DIR}')).toBe('/abs/skills/x');
  });

  test('on a Windows host the skill folder is written with forward slashes, like the path variables', async () => {
    const absolute = { origin: { kind: 'project' } as const, dir: 'C:\\Users\\me\\skills\\x' };
    expect(await expand(absolute, '${CLAUDE_SKILL_DIR}/a', { windows: true })).toBe(
      'C:/Users/me/skills/x/a',
    );
  });

  test('an unresolved ${user_config.KEY} is a warning for a plugin skill and plain text elsewhere', async () => {
    const ports = { locations: locations(), environment: fakeEnvironment() };
    const plugin = await substituteVariables(
      '${user_config.token}',
      buildVariables(skillOf(PLUGIN), SESSION, ports),
    );
    expect(plugin.text).toBe('${user_config.token}');
    expect(plugin.issues.map((issue) => issue.severity)).toEqual(['warning']);
    const project = await substituteVariables(
      '${user_config.token}',
      buildVariables(skillOf({ kind: 'project' }), SESSION, ports),
    );
    expect(project).toEqual({ text: '${user_config.token}', issues: [] });
  });

  test('${VAR} of the environment is never read: the skill text is no shell', async () => {
    const ports = { locations: locations(), environment: fakeEnvironment({ HOME: '/h' }) };
    const vars = buildVariables(skillOf(PLUGIN), SESSION, ports);
    expect((await substituteVariables('${HOME} ${HOME:-x}', vars)).text).toBe('${HOME} ${HOME:-x}');
  });
});
