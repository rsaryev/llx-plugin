/**
 * How a `!` command receives the invocation's arguments (skills.md, "Available string
 * substitutions", "Inject dynamic context"; docs/SECURITY.md, "`$ARGUMENTS` in `!` blocks").
 *
 * Judgment (spec/judgments.md, `shellArguments`): by default the arguments are pasted into the
 * command, as Claude Code does. Under `shellArguments: 'environment-reference'` a bash command gets
 * each placeholder as a reference to a variable holding the value, so a value is never parsed as
 * shell; the permission check reads the command with each value quoted where it lands.
 * tests/host/skill-shell-arguments.test.ts runs it through `sh`.
 */
import { describe, expect, test } from 'bun:test';
import { abortOf, expandWith, skillFrom, textOf } from '../support/expand.ts';

const ALLOW = { permissions: () => 'allow' as const };
const REFERENCE = { session: { shellArguments: 'environment-reference' as const } };

async function bound(body: string, args: string, frontmatter = '') {
  const run = await expandWith(skillFrom(frontmatter, body), {
    rules: { allow: ['Bash'] },
    request: { arguments: args, ...REFERENCE },
  });
  return { run, spec: run.runs[0]?.spec, env: run.runs[0]?.env ?? {} };
}

describe("`!` command arguments under shellArguments 'environment-reference' (judgment)", () => {
  test('by default the value is pasted into the command, as Claude Code does', async () => {
    const run = await expandWith(skillFrom('', '!`echo $ARGUMENTS`'), {
      ...ALLOW,
      request: { arguments: 'a; touch PWNED' },
    });
    expect(run.runs[0]?.spec.command).toBe('echo a; touch PWNED');
  });

  test('an unquoted `$ARGUMENTS` is each argument as its own quoted reference', async () => {
    const { spec, env, run } = await bound('!`echo $ARGUMENTS`', 'a; "touch PWNED"');
    expect(spec?.command).toBe('echo "${SKILL_ARGUMENT_0}" "${SKILL_ARGUMENT_1}"');
    expect(env).toMatchObject({ SKILL_ARGUMENT_0: 'a;', SKILL_ARGUMENT_1: 'touch PWNED' });
    expect(run.asked.map((call) => call.command)).toEqual(["echo 'a;' 'touch PWNED'"]);
  });

  test('`$ARGUMENTS` in quotes is the text as typed, in the quoting it sits in', async () => {
    const double = await bound('!`echo "$ARGUMENTS"`', 'it\'s "x"');
    expect(double.spec?.command).toBe('echo "${SKILL_ARGUMENTS}"');
    expect(double.env['SKILL_ARGUMENTS']).toBe('it\'s "x"');
    expect(double.run.asked[0]?.command).toBe('echo "it\'s \\"x\\""');
    const single = await bound("!`echo '$ARGUMENTS'`", "it's");
    expect(single.spec?.command).toBe(`echo ''"\${SKILL_ARGUMENTS}"''`);
    expect(single.run.asked[0]?.command).toBe(`echo 'it'\\''s'`);
  });

  test('`$N`, `$ARGUMENTS[N]` and a declared `$name` are one argument each', async () => {
    const { spec, env } = await bound(
      '!`git log $0 $ARGUMENTS[1] $base`',
      'main "a b" dev',
      'arguments: [x, y, base]',
    );
    expect(spec?.command).toBe(
      'git log "${SKILL_ARGUMENT_0}" "${SKILL_ARGUMENT_1}" "${SKILL_ARGUMENT_2}"',
    );
    expect(env).toMatchObject({
      SKILL_ARGUMENT_0: 'main',
      SKILL_ARGUMENT_1: 'a b',
      SKILL_ARGUMENT_2: 'dev',
    });
  });

  test('an escaped or unmatched placeholder stays as the pasted mode writes it', async () => {
    const { spec, env } = await bound('!`echo \\$0 $5 $HOME`', 'x');
    expect(spec?.command).toBe('echo $0 $5 $HOME');
    expect(Object.keys(env).filter((name) => name.startsWith('SKILL_ARGUMENT'))).toEqual([]);
  });

  test('the text outside the commands keeps the values pasted', async () => {
    const { run } = await bound('Args: $ARGUMENTS !`echo $0`', 'a b');
    expect(textOf(run.expansion)).toBe('Args: a b ');
  });

  test('a control character in a value is refused before anything runs, as when pasted', async () => {
    const { run } = await bound('!`echo "$ARGUMENTS"`', 'a\u0000b');
    expect(abortOf(run.expansion)).toContain('control characters');
    expect(run.runs).toEqual([]);
  });

  test('a PowerShell command keeps the values pasted', async () => {
    const run = await expandWith(skillFrom('shell: powershell', '!`Write-Output $ARGUMENTS`'), {
      ...ALLOW,
      request: { arguments: 'a b', shells: { bash: true, powershell: true }, ...REFERENCE },
    });
    expect(run.runs[0]?.spec.command).toBe('Write-Output a b');
  });
});
