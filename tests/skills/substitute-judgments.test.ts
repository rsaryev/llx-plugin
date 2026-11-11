/**
 * What skills.md leaves open for the substitution of a skill's text and of its `allowed-tools`
 * (judgments in spec/judgments.md).
 */
import { describe, expect, test } from 'bun:test';
import { substitute } from '../../src/skills/substitute.ts';
import { buildVariables, substituteAllowedTools } from '../../src/skills/variables.ts';
import { fakeEnvironment, locations } from '../support/ports.ts';
import { PLUGIN, SESSION, skillOf } from '../support/skill-variables.ts';

describe('what the docs leave open (judgments)', () => {
  test('only the Bash rules of allowed-tools are substituted; any other rule is kept as written', async () => {
    const skill = skillOf(
      PLUGIN,
      'allowed-tools: Read(${CLAUDE_SKILL_DIR}/*) Bash(${CLAUDE_SKILL_DIR}/x.sh) Grep\n',
    );
    const vars = buildVariables(skill, SESSION, {
      locations: locations(),
      environment: fakeEnvironment(),
    });
    expect(await substituteAllowedTools(skill, vars)).toEqual({
      rules: [
        'Read(${CLAUDE_SKILL_DIR}/*)',
        'Bash(/plugins/my-plugin/skills/render-chart/x.sh)',
        'Grep',
      ],
      issues: [],
    });
  });

  test('${user_config.KEY} typed in the arguments is substituted too, for a plugin skill', async () => {
    const skill = skillOf(PLUGIN, '', 'Use $ARGUMENTS');
    const vars = buildVariables(
      skill,
      {
        ...SESSION,
        userConfig: {
          declared: { region: { type: 'string', title: 'Region', description: 'Region' } },
          values: { region: 'eu' },
        },
      },
      { locations: locations(), environment: fakeEnvironment() },
    );
    const { text } = await substitute(skill.body, {
      rawArguments: '${user_config.region}',
      names: [],
      vars,
    });
    expect(text.trim()).toBe('Use eu');
  });
});
