/**
 * How a `!` command carries its path variables (skills.md, "Available string substitutions"; "How
 * injected commands run"; "Permission checks on injected commands": in auto mode a command that
 * needs approval loads "with an instruction telling Claude to run the command first").
 *
 * Judgment (spec/judgments.md, `shellPaths`): the permission check, the refusal check and the
 * instruction read the command with the paths written in; the shell receives each path as a
 * reference with the value in its environment, PowerShell's as `${env:NAME}`; `pasted` writes the
 * path into the shell's text too. tests/host/skill-shell-paths.test.ts runs it through `sh`.
 */
import { describe, expect, test } from 'bun:test';
import { expandWith, PLUGIN, skillFrom, textOf } from '../support/expand.ts';

const DIR = '/work/app/.claude/skills/pr-summary';
const ALLOW = { permissions: () => 'allow' as const };

describe('the path variables of a `!` command (judgment)', () => {
  test('the shell gets `${NAME}` and the environment the value; the rules see the path', async () => {
    const skill = skillFrom('', '!`cat "${CLAUDE_SKILL_DIR}/a" "${CLAUDE_PROJECT_DIR}/b"`');
    const run = await expandWith(skill, { rules: { allow: ['Bash(cat *)'] } });
    expect(run.asked.map((call) => call.command)).toEqual([`cat "${DIR}/a" "/work/app/b"`]);
    expect(run.runs[0]?.spec.command).toBe('cat "${CLAUDE_SKILL_DIR}/a" "${CLAUDE_PROJECT_DIR}/b"');
    expect(run.runs[0]?.env).toMatchObject({
      CLAUDE_SKILL_DIR: DIR,
      CLAUDE_PROJECT_DIR: '/work/app',
    });
  });

  test('a plugin skill exports only the variables its command names', async () => {
    const skill = skillFrom('', '!`ls "${CLAUDE_PLUGIN_DATA}"`', PLUGIN);
    const run = await expandWith(skill, ALLOW);
    expect(run.runs[0]?.spec.command).toBe('ls "${CLAUDE_PLUGIN_DATA}"');
    const env = run.runs[0]?.env ?? {};
    expect(env['CLAUDE_PLUGIN_DATA']).toBe('/data/my-plugin');
    expect(env['CLAUDE_SKILL_DIR']).toBeUndefined();
    expect(env['CLAUDE_PLUGIN_ROOT']).toBeUndefined();
  });

  test('a variable an origin leaves as written is neither substituted nor exported', async () => {
    const run = await expandWith(skillFrom('', '!`ls ${CLAUDE_PLUGIN_ROOT}`'), ALLOW);
    expect(run.runs[0]?.spec.command).toBe('ls ${CLAUDE_PLUGIN_ROOT}');
    expect(run.runs[0]?.env['CLAUDE_PLUGIN_ROOT']).toBeUndefined();
  });

  test('a `${CLAUDE_SKILL_DIR}` an argument brings is a reference too', async () => {
    const skill = skillFrom('', '!`ls $ARGUMENTS`');
    const run = await expandWith(skill, {
      ...ALLOW,
      request: { arguments: '${CLAUDE_SKILL_DIR}/x' },
    });
    expect(run.runs[0]?.spec.command).toBe('ls ${CLAUDE_SKILL_DIR}/x');
    expect(run.runs[0]?.env['CLAUDE_SKILL_DIR']).toBe(DIR);
  });

  test('a PowerShell skill gets `${env:NAME}`', async () => {
    const skill = skillFrom('shell: powershell', '!`Get-Item "${CLAUDE_SKILL_DIR}"`');
    const run = await expandWith(skill, {
      ...ALLOW,
      request: { shells: { bash: true, powershell: true } },
    });
    expect(run.runs[0]?.spec).toMatchObject({
      shell: 'powershell',
      command: 'Get-Item "${env:CLAUDE_SKILL_DIR}"',
    });
    expect(run.runs[0]?.env['CLAUDE_SKILL_DIR']).toBe(DIR);
  });

  test("under shellPaths 'pasted' the shell gets the path and no export", async () => {
    const skill = skillFrom('', '!`cat "${CLAUDE_SKILL_DIR}/a"`');
    const run = await expandWith(skill, {
      ...ALLOW,
      request: { session: { shellPaths: 'pasted' } },
    });
    expect(run.runs[0]?.spec.command).toBe(`cat "${DIR}/a"`);
    expect(run.runs[0]?.env['CLAUDE_SKILL_DIR']).toBeUndefined();
  });

  test("auto mode's instruction names the command with the path written in", async () => {
    const skill = skillFrom('', '!`cat "${CLAUDE_SKILL_DIR}/a"`');
    const run = await expandWith(skill, {
      permissions: () => 'ask',
      request: { permissionMode: 'auto' },
    });
    expect(run.runs).toHaveLength(0);
    expect(textOf(run.expansion)).toContain(`cat "${DIR}/a"`);
  });
});
