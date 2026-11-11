/**
 * permissions.md § Bash > Compound commands: "The recognized command separators are `&&`, `||`,
 * `;`, `|`, `|&`, `&`, and newlines. Every subcommand must be allowed for a compound command to
 * run without a prompt"; "Deny and ask rules apply when any subcommand matches them, including a
 * command nested inside a subshell, a command substitution, or a control-flow body such as a `for`
 * loop" (the `cd /tmp && git clean -f` and `echo "$(git clean -f)"` examples); "When `&&` or `||`
 * has nothing after it, such as in `npm test &&`, Claude Code treats the command as unparseable and
 * doesn't split it into subcommands for allow-rule matching, so a rule such as `Bash(npm *)`
 * doesn't approve it."
 *
 * No requirement id covers this section, so none of it is under spec(). Where the docs name no
 * algorithm (quotes, redirects, here-documents) the choice is a row in spec/judgments.md.
 */
import { expect, test } from 'bun:test';
import { splitCommand } from '../../src/rules/bash/split.ts';
import { allows, asks, denies } from '../support/bash-rules.ts';
import { spec } from '../support/spec.ts';

const SEPARATORS = ['&&', '||', ';', '|', '|&', '&', '\n'];

spec(['permissions.behavior.Compound commands'], () => {
  test.each(SEPARATORS)('%j separates two subcommands', (separator) => {
    expect(splitCommand(`safe-cmd a ${separator} other-cmd b`)).toEqual({
      subcommands: ['safe-cmd a', 'other-cmd b'],
      parseable: true,
    });
  });

  test('every subcommand must be allowed: Bash(safe-cmd *) does not approve safe-cmd && other-cmd', () => {
    expect(allows('Bash(safe-cmd *)', 'safe-cmd')).toBe(true);
    for (const separator of SEPARATORS) {
      const command = `safe-cmd x ${separator} other-cmd`;
      expect([command, allows('Bash(safe-cmd *)', command)]).toEqual([command, false]);
    }
  });

  test('a rule that covers every subcommand approves the compound command', () => {
    expect(allows('Bash(npm *)', 'npm test && npm run build | npm x; npm y')).toBe(true);
  });

  test('a separator inside quotes or after a backslash does not split', () => {
    expect(splitCommand(String.raw`echo "a && b" ; echo 'c | d' ; echo e\;f`).subcommands).toEqual([
      'echo "a && b"',
      "echo 'c | d'",
      String.raw`echo e\;f`,
    ]);
  });

  test('a redirect that holds an & is not a background separator', () => {
    expect(splitCommand('npm test 2>&1').subcommands).toEqual(['npm test 2>&1']);
    expect(splitCommand('npm test &> out.log').subcommands).toEqual(['npm test &> out.log']);
    expect(splitCommand('cat <&3').subcommands).toEqual(['cat <&3']);
  });

  test('blank pieces are not subcommands', () => {
    expect(splitCommand('a;; b ;\n\n c;').subcommands).toEqual(['a', 'b', 'c']);
  });
});

spec(['permissions.behavior.Compound commands'], () => {
  test('the documented examples: cd /tmp && git clean -f, and echo "$(git clean -f)"', () => {
    for (const rule of [denies, asks]) {
      expect(rule('Bash(git clean *)', 'cd /tmp && git clean -f')).toBe(true);
      expect(rule('Bash(git clean *)', 'echo "$(git clean -f)"')).toBe(true);
    }
  });

  test('a command nested in $(), backticks, a subshell or a control-flow body is a subcommand', () => {
    const nested = [
      'echo $(git clean -f)',
      'echo `git clean -f`',
      'echo "`git clean -f`"',
      '(git clean -f)',
      '(cd x && git clean -f)',
      '{ git clean -f; }',
      'for f in a b; do git clean -f; done',
      'if true; then git clean -f; fi',
      'while true; do git clean -f; done',
      'for f in $(git clean -f); do echo $f; done',
      'echo $(echo $(git clean -f))',
    ];
    for (const command of nested) {
      expect([command, denies('Bash(git clean *)', command)]).toEqual([command, true]);
    }
  });

  test('text that is only quoted is not a command: single quotes hide a substitution', () => {
    expect(denies('Bash(git clean *)', "echo 'git clean -f'")).toBe(false);
    expect(denies('Bash(git clean *)', "echo '$(git clean -f)'")).toBe(false);
    expect(denies('Bash(git clean *)', 'echo "git clean -f"')).toBe(false);
  });

  test('a command nested in a substitution must also be allowed by an allow rule', () => {
    expect(allows('Bash(echo *)', 'echo $(date)')).toBe(false);
    expect(allows('Bash(echo *)', 'echo hi')).toBe(true);
    expect(allows('Bash(*)', 'echo $(date)')).toBe(true);
  });

  test('the loop header is not a command, so an allow rule for the body covers the loop', () => {
    expect(allows('Bash(echo *)', 'for f in a b; do echo $f; done')).toBe(true);
  });
});

spec(['permissions.behavior.Compound commands'], () => {
  test.each(['npm test &&', 'npm test ||', 'npm test && ', 'npm test &&\n'])(
    '%j is not split for an allow rule',
    (command) => {
      expect(splitCommand(command).parseable).toBe(false);
      expect(allows('Bash(npm *)', command)).toBe(false);
      expect(allows('Bash(npm test &&)', command)).toBe(false);
    },
  );

  test('a newline after && continues the command', () => {
    expect(splitCommand('npm test &&\nnpm build')).toEqual({
      subcommands: ['npm test', 'npm build'],
      parseable: true,
    });
  });
});
