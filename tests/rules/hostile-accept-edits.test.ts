/**
 * permission-modes.md § Auto-approve file edits with acceptEdits mode, hostile spellings: a `sed`
 * script that writes (`w`), executes (`e`) or reads (`r`) another file, a script read from a file,
 * and a target directory given as an option are not edits of the operands in the working directory.
 */
import { describe, expect, test } from 'bun:test';
import { bash } from '../support/decide.ts';
import { spec } from '../support/spec.ts';

const outcome = (command: string) => ({ command, outcome: bash('acceptEdits', command).outcome });

spec('permissions.modes.Auto-approve file edits with acceptEdits mode', () => {
  test('a sed script that writes, executes or reads another file asks', () => {
    for (const command of [
      "sed 's/a/b/w /etc/x' f",
      "sed -i 's/a/b/w /etc/x' f",
      "sed '1e touch /tmp/pwn' f",
      "sed 's/a/touch x/e' f",
      "sed -e 's/a/b/w /etc/x' f",
      "sed --expression='w /etc/x' f",
      "sed -n '1w /etc/x' f",
      "sed 'r /etc/shadow' f",
      "sed '1!W /etc/x' f",
      'sed -f script.sed f',
      "sed -i -e 's/a/b/' -e 'w /etc/x' f",
    ]) {
      expect(outcome(command)).toEqual({ command, outcome: 'ask' });
    }
  });

  test('a target directory given as an option is a target', () => {
    for (const command of [
      'mv --target-directory=/etc f',
      'mv -t/etc f',
      'cp -vt/etc f',
      'cp --target-directory /etc f',
      'mv -t /etc f',
    ]) {
      expect(outcome(command)).toEqual({ command, outcome: 'ask' });
    }
  });
});

describe('Plain sed edits stay edits', () => {
  test('substitutions, deletions and prints in the working directory are approved', () => {
    for (const command of [
      "sed -i 's/a/b/g' f",
      "sed -i.bak -E 's/(a|b)/w/2' f",
      "sed -i -e 's/a/b/' -e '/x/d' f",
      "sed -n '1,3p' f",
      "sed -i 's|/usr/bin|/opt/bin|' f",
      'mv a b',
      'mv -t dist f',
    ]) {
      expect(outcome(command)).toEqual({ command, outcome: 'allow' });
    }
  });
});
