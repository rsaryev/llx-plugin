/**
 * skills.md § Frontmatter reference (`model`, `effort`, `shell`), § How injected commands run (the
 * shell choice and its one failure), model-config.md § Restrict model selection ("Skill or command
 * override") and § Set the effort level ("A skill's `effort` applies until the end of the turn it
 * runs in"), env-vars.md (`CLAUDE_CODE_EFFORT_LEVEL`, `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS`).
 */
import { describe, expect, test } from 'bun:test';
import {
  readExecutionEnvironment,
  resolveShell,
  resolveTurnOverrides,
  type ModelAvailability,
} from '../../src/skills/execution.ts';
import { fakeEnvironment } from '../support/ports.ts';
import { skillWith } from '../support/skills.ts';
import { spec } from '../support/spec.ts';

const RESEARCH = 'name: deep-research\ndescription: Research a topic thoroughly\n';
const FORK = `${RESEARCH}context: fork\n`;

const allow = (...blocked: string[]): ModelAvailability => ({
  allowed: (model) => !blocked.includes(model),
});

spec('skills.frontmatter.model', () => {
  test('"Model to use when this skill is active": the override applies for the rest of the turn', () => {
    expect(resolveTurnOverrides(skillWith(`${RESEARCH}model: opus`), {})).toEqual({
      target: 'turn',
      model: 'opus',
    });
  });

  test('a skill with no `model` overrides nothing', () => {
    expect(resolveTurnOverrides(skillWith(RESEARCH), {})).toEqual({ target: 'turn' });
  });

  test('"`inherit` to keep the active model"', () => {
    expect(resolveTurnOverrides(skillWith(`${RESEARCH}model: inherit`), {})).toEqual({
      target: 'turn',
    });
  });

  test('"A value excluded by your organization\'s `availableModels` allowlist isn\'t used, and the session keeps its current model"', () => {
    const result = resolveTurnOverrides(skillWith(`${RESEARCH}model: opus`), {
      models: allow('opus'),
    });
    expect(result).toEqual({ target: 'turn', modelKept: 'excluded' });
  });

  test('an allowed value is used', () => {
    const result = resolveTurnOverrides(skillWith(`${RESEARCH}model: sonnet`), {
      models: allow('opus'),
    });
    expect(result).toMatchObject({ model: 'sonnet' });
  });

  test('in auto mode "a model that auto mode doesn\'t support also isn\'t used, and the session keeps its current model"', () => {
    const models: ModelAvailability = {
      allowed: () => true,
      supportedInMode: (m) => m !== 'haiku',
    };
    expect(resolveTurnOverrides(skillWith(`${RESEARCH}model: haiku`), { models })).toEqual({
      target: 'turn',
      modelKept: 'unsupported-in-mode',
    });
    expect(resolveTurnOverrides(skillWith(`${RESEARCH}model: opus`), { models })).toMatchObject({
      model: 'opus',
    });
  });

  test('"With `context: fork`, the value sets the forked subagent\'s model instead"', () => {
    expect(resolveTurnOverrides(skillWith(`${FORK}model: haiku`), {})).toEqual({
      target: 'subagent',
      model: 'haiku',
    });
  });

  test('a forked skill with an excluded value "follows the same rules as a subagent model override": the newest permitted version of the family', () => {
    const models: ModelAvailability = {
      allowed: (model) => model !== 'opus',
      substitute: (model) => (model === 'opus' ? 'claude-opus-4-6' : undefined),
    };
    expect(resolveTurnOverrides(skillWith(`${FORK}model: opus`), { models })).toEqual({
      target: 'subagent',
      model: 'claude-opus-4-6',
      modelSubstituted: true,
    });
  });

  test('a forked skill with an excluded value and no substitute runs on the inherited model', () => {
    expect(
      resolveTurnOverrides(skillWith(`${FORK}model: claude-old`), { models: allow('claude-old') }),
    ).toEqual({ target: 'subagent', modelKept: 'excluded' });
  });
});

spec('skills.frontmatter.effort', () => {
  test('"Overrides the session effort level" for the rest of the turn', () => {
    expect(resolveTurnOverrides(skillWith(`${RESEARCH}effort: max`), {})).toEqual({
      target: 'turn',
      effort: { level: 'max', source: 'skill' },
    });
  });

  test('a skill with no `effort` overrides nothing: "the level comes from the effort resolution order"', () => {
    expect(resolveTurnOverrides(skillWith(RESEARCH), { effortEnvironment: 'high' })).toEqual({
      target: 'turn',
    });
  });

  test('"but not the `CLAUDE_CODE_EFFORT_LEVEL` environment variable"', () => {
    const environment = readExecutionEnvironment(
      fakeEnvironment({ CLAUDE_CODE_EFFORT_LEVEL: 'low' }),
    );
    expect(
      resolveTurnOverrides(skillWith(`${RESEARCH}effort: max`), {
        effortEnvironment: environment.effort,
      }),
    ).toEqual({ target: 'turn', effort: { level: 'low', source: 'environment' } });
  });

  test('`CLAUDE_CODE_EFFORT_LEVEL=auto` or `unset` sends no level: the skill does not set one either', () => {
    for (const value of ['auto', 'unset']) {
      const environment = readExecutionEnvironment(
        fakeEnvironment({ CLAUDE_CODE_EFFORT_LEVEL: value }),
      );
      expect(environment.effort).toBe('none');
      expect(
        resolveTurnOverrides(skillWith(`${RESEARCH}effort: max`), {
          effortEnvironment: environment.effort,
        }),
      ).toEqual({ target: 'turn', effort: { source: 'environment' } });
    }
  });

  test('"With `context: fork`, the value sets the forked subagent\'s effort level instead"', () => {
    expect(resolveTurnOverrides(skillWith(`${FORK}effort: xhigh`), {})).toEqual({
      target: 'subagent',
      effort: { level: 'xhigh', source: 'skill' },
    });
  });

  test('"A `maxEffortLevel` ... still limits the level the skill or subagent runs at"', () => {
    expect(
      resolveTurnOverrides(skillWith(`${RESEARCH}effort: max`), { maxEffort: 'high' }),
    ).toEqual({ target: 'turn', effort: { level: 'high', source: 'skill' } });
    expect(
      resolveTurnOverrides(skillWith(`${RESEARCH}effort: low`), { maxEffort: 'high' }),
    ).toEqual({ target: 'turn', effort: { level: 'low', source: 'skill' } });
  });

  test('the cap also lowers the level the environment variable sets', () => {
    expect(
      resolveTurnOverrides(skillWith(`${RESEARCH}effort: low`), {
        effortEnvironment: 'max',
        maxEffort: 'medium',
      }),
    ).toEqual({ target: 'turn', effort: { level: 'medium', source: 'environment' } });
  });

  test('"falls back to the highest supported level at or below the one you set" (`xhigh` runs as `high`)', () => {
    const noXhigh = ['low', 'medium', 'high'] as const;
    expect(
      resolveTurnOverrides(skillWith(`${RESEARCH}effort: xhigh`), { supportedEfforts: noXhigh }),
    ).toEqual({ target: 'turn', effort: { level: 'high', source: 'skill' } });
    expect(
      resolveTurnOverrides(skillWith(`${RESEARCH}effort: max`), { supportedEfforts: noXhigh }),
    ).toMatchObject({ effort: { level: 'high' } });
    expect(
      resolveTurnOverrides(skillWith(`${RESEARCH}effort: medium`), { supportedEfforts: noXhigh }),
    ).toMatchObject({ effort: { level: 'medium' } });
    expect(
      resolveTurnOverrides(skillWith(`${RESEARCH}effort: low`), {
        effortEnvironment: 'xhigh',
        supportedEfforts: noXhigh,
      }),
    ).toEqual({ target: 'turn', effort: { level: 'high', source: 'environment' } });
  });

  test('the fallback applies to the level the cap left, and a skipped level is not used (`max` with only `low` and `max`)', () => {
    expect(
      resolveTurnOverrides(skillWith(`${RESEARCH}effort: max`), {
        maxEffort: 'high',
        supportedEfforts: ['low', 'max'],
      }),
    ).toMatchObject({ effort: { level: 'low' } });
  });

  test('the five levels are the options, lowest first', () => {
    for (const level of ['low', 'medium', 'high', 'xhigh', 'max'] as const) {
      expect(resolveTurnOverrides(skillWith(`${RESEARCH}effort: ${level}`), {})).toMatchObject({
        effort: { level },
      });
    }
  });
});

const BOTH = { bash: true, powershell: true };
const NO_BASH = { bash: false, powershell: true };

spec('skills.frontmatter.shell', () => {
  test('"`shell: powershell`, with the PowerShell tool enabled: the commands run through the PowerShell tool"', () => {
    expect(resolveShell(skillWith('shell: powershell'), BOTH)).toEqual({
      ok: true,
      tool: 'powershell',
    });
    expect(resolveShell(skillWith('shell: powershell'), NO_BASH)).toEqual({
      ok: true,
      tool: 'powershell',
    });
  });

  test("`shell: bash` when bash isn't available fails the invocation with the quoted message", () => {
    const skill = skillWith('shell: bash', { name: 'build' });
    expect(resolveShell(skill, NO_BASH)).toEqual({
      ok: false,
      message:
        'Skill build requires bash (`shell: bash` in frontmatter) but Git Bash was not found',
    });
  });

  test('"Any other combination": the Bash tool when bash is available', () => {
    expect(resolveShell(skillWith('shell: bash'), BOTH)).toEqual({ ok: true, tool: 'bash' });
    expect(resolveShell(skillWith(''), BOTH)).toEqual({ ok: true, tool: 'bash' });
    // `shell: powershell` with the tool off, bash present
    expect(resolveShell(skillWith('shell: powershell'), { bash: true, powershell: false })).toEqual(
      {
        ok: true,
        tool: 'bash',
      },
    );
  });

  test('"When it isn\'t, they run through the PowerShell tool": the default shell on Windows without Git Bash', () => {
    expect(resolveShell(skillWith(''), NO_BASH)).toEqual({ ok: true, tool: 'powershell' });
  });
});

describe('execution details (judgments: spec/judgments.md)', () => {
  test('no shell tool at all fails with a message naming the skill', () => {
    const result = resolveShell(skillWith('', { name: 'build' }), {
      bash: false,
      powershell: false,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.message).toContain('build');
  });

  test('no supported level at or below the one asked sends no level (an empty list or only higher ones)', () => {
    const asked = skillWith(`${RESEARCH}effort: low`);
    expect(resolveTurnOverrides(asked, { supportedEfforts: ['high'] })).toEqual({
      target: 'turn',
      effort: { source: 'skill' },
    });
    expect(resolveTurnOverrides(asked, { supportedEfforts: [] })).toEqual({
      target: 'turn',
      effort: { source: 'skill' },
    });
  });

  test('an effort variable that is not a level is ignored', () => {
    const environment = readExecutionEnvironment(
      fakeEnvironment({ CLAUDE_CODE_EFFORT_LEVEL: 'turbo' }),
    );
    expect(environment.effort).toBeUndefined();
  });

  test('`CLAUDE_CODE_DISABLE_BACKGROUND_TASKS` is on only for `1`', () => {
    for (const value of ['0', 'true', '', 'yes']) {
      const environment = readExecutionEnvironment(
        fakeEnvironment({ CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: value }),
      );
      expect(environment.backgroundTasksDisabled).toBe(false);
    }
  });

  test('the auto-mode rule does not apply to a forked skill: only the allowlist does', () => {
    const models: ModelAvailability = { allowed: () => true, supportedInMode: () => false };
    expect(resolveTurnOverrides(skillWith(`${FORK}model: haiku`), { models })).toMatchObject({
      model: 'haiku',
    });
  });

  test('an allowed forked model is used as written', () => {
    expect(
      resolveTurnOverrides(skillWith(`${FORK}model: claude-sonnet-5`), { models: allow('opus') }),
    ).toEqual({ target: 'subagent', model: 'claude-sonnet-5' });
  });
});
