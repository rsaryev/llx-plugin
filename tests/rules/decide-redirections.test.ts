/**
 * permissions.md § Redirections ("Claude Code checks the redirect target against your file rules as if
 * Claude wrote or read that file directly"; output targets: `Edit` rules, protected paths, working
 * directories; input targets: `Read` rules and working directories; `~` or glob needs approval; "A
 * rule such as `Bash(git commit *)` allows the command, not the target"; `/dev/null`, `2>&1`, `<&3`,
 * here-docs and here-strings are not checked; `tee` targets), § Read-only commands ("`cd` with a
 * redirect"). Asserted through `decide()`.
 */
import { describe, expect, test } from 'bun:test';
import { allow, ask, bash, classify, deny, rulesOf } from '../support/decide.ts';
import { spec } from '../support/spec.ts';

const commit = rulesOf(['allow', 'Bash(git commit *)'], ['allow', 'Bash(make *)']);

spec('permissions.behavior.Redirections', () => {
  test('a rule for the command does not allow its output target outside the working directories', () => {
    expect(bash('default', 'git commit -m x > /etc/log', { rules: commit })).toEqual(
      ask('default-prompt'),
    );
    // "as if Claude wrote ... that file directly": a write in the working directory asks in default mode.
    expect(bash('default', 'git commit -m x > out.log', { rules: commit })).toEqual(
      ask('default-prompt'),
    );
  });

  test('an Edit allow rule covers a target outside; an Edit deny rule blocks one inside', () => {
    const rules = rulesOf(['allow', 'Bash(make *)'], ['allow', 'Edit(//tmp/**)']);
    expect(bash('default', 'make > /tmp/build.log', { rules })).toEqual(allow('allow-rule'));
    const denied = rulesOf(['allow', 'Bash(make *)'], ['deny', 'Edit(./secrets/**)']);
    expect(bash('default', 'make > secrets/out', { rules: denied })).toEqual(deny('deny-rule'));
  });

  test('a target that starts with ~ or contains a glob needs approval', () => {
    expect(bash('default', 'make >> ~/log', { rules: commit })).toEqual(ask('default-prompt'));
    expect(bash('default', 'make > out*.log', { rules: commit })).toEqual(ask('default-prompt'));
  });

  test('2> and >> are output redirects too', () => {
    expect(bash('default', 'make 2> /etc/err', { rules: commit })).toEqual(ask('default-prompt'));
    expect(bash('default', 'make >> /etc/err', { rules: commit })).toEqual(ask('default-prompt'));
  });

  test('a protected path as an output target prompts', () => {
    expect(bash('default', 'make > .git/config', { rules: commit })).toEqual(ask('protected-path'));
  });

  test('an input target outside the working directories needs approval unless a Read rule allows it', () => {
    expect(bash('default', 'make < /etc/input', { rules: commit })).toEqual(ask('default-prompt'));
    const rules = rulesOf(['allow', 'Bash(make *)'], ['allow', 'Read(//etc/**)']);
    expect(bash('default', 'make < /etc/input', { rules })).toEqual(allow('allow-rule'));
  });

  test('a Read deny rule blocks an input target', () => {
    const rules = rulesOf(['allow', 'Bash(make *)'], ['deny', 'Read(./.env)']);
    expect(bash('default', 'make < .env', { rules })).toEqual(deny('deny-rule'));
  });

  test('an input glob, or a relative path after a cd, needs approval even when an allow rule covers it', () => {
    const rules = rulesOf(['allow', 'Bash(make *)'], ['allow', 'Bash(cd *)'], ['allow', 'Read']);
    expect(bash('default', 'make < in*.txt', { rules })).toEqual(ask('default-prompt'));
    expect(bash('default', 'cd src && make < in.txt', { rules })).toEqual(ask('default-prompt'));
  });

  test('targets with no file behind them are not checked', () => {
    for (const command of [
      'make > /dev/null',
      'make 2>&1',
      'make <&3',
      "make <<'EOF'\nx\nEOF",
      'make <<< hello',
    ]) {
      expect(bash('default', command, { rules: commit })).toEqual(allow('allow-rule'));
    }
  });

  test('the files tee writes are checked like output targets, in a pipeline too', () => {
    const rules = rulesOf(['allow', 'Bash(make *)'], ['allow', 'Bash(tee *)']);
    expect(bash('default', 'make | tee /etc/build.log', { rules })).toEqual(ask('default-prompt'));
    expect(bash('default', 'make | tee build.log', { rules })).toEqual(allow('allow-rule'));
  });

  test('bypassPermissions checks no target, and dontAsk denies the prompt', () => {
    expect(bash('bypassPermissions', 'make > /etc/log')).toEqual(allow('mode-bypass'));
    expect(bash('dontAsk', 'make > /etc/log', { rules: commit })).toEqual(deny('mode-dontask'));
  });
});

spec('permissions.behavior.Read-only commands.cd with a redirect', () => {
  test('a redirect to /dev/null after a cd does not prompt', () => {
    expect(bash('default', 'cd app; grep -r pattern . 2>/dev/null')).toEqual(
      allow('read-only-command'),
    );
  });

  test('a redirect target that depends on the directory the cd moved to prompts', () => {
    expect(bash('default', 'cd app; grep -r pattern . > found.txt')).toEqual(ask('default-prompt'));
  });
});

describe('redirect targets per mode (judgments: spec/judgments.md, oracle 2.1.319)', () => {
  test('in default mode a target in the working directory asks unless an Edit allow rule covers it', () => {
    const lsRule = rulesOf(['allow', 'Bash(ls *)']);
    expect(bash('default', 'ls > list.txt')).toEqual(ask('default-prompt'));
    expect(bash('default', 'ls > list.txt', { rules: lsRule })).toEqual(ask('default-prompt'));
    const edit = rulesOf(['allow', 'Edit(**/list.txt)']);
    expect(bash('default', 'ls > list.txt', { rules: edit })).toEqual(allow('read-only-command'));
    expect(bash('dontAsk', 'ls > list.txt')).toEqual(deny('mode-dontask'));
  });

  test('an input target in the working directory keeps a command read-only', () => {
    expect(bash('default', 'cat < a.txt')).toEqual(allow('read-only-command'));
    expect(bash('default', 'wc -l < a.txt')).toEqual(allow('read-only-command'));
  });

  test('acceptEdits takes a target in the working directory as an edit there', () => {
    for (const command of [
      'ls > list.txt',
      'git status > s.txt',
      'cat a.txt > c.txt',
      'echo hi 2> err.txt',
      'echo a > a.txt && echo b > b.txt',
    ]) {
      expect(bash('acceptEdits', command)).toEqual(allow('accept-edits'));
    }
    expect(bash('acceptEdits', 'mkdir d3 > log.txt')).toEqual(allow('accept-edits'));
    const python = rulesOf(['allow', 'Bash(python3 *)']);
    expect(bash('acceptEdits', 'python3 -c 1 > p.txt', { rules: python })).toEqual(
      allow('allow-rule'),
    );
  });

  test('acceptEdits still asks for a protected, outside, home, glob or after-cd target', () => {
    expect(bash('acceptEdits', 'echo hi > .git/x')).toEqual(ask('protected-path'));
    for (const command of [
      'mkdir d4 > /tmp/m.txt',
      'echo tick > ~/x.txt',
      'echo tick > sub*.txt',
      'cd sub; grep -r a . > found.txt',
    ]) {
      expect(bash('acceptEdits', command)).toEqual(ask('default-prompt'));
    }
  });

  test('auto mode sends a command that writes in the working directory to the classifier', () => {
    expect(bash('auto', 'ls > list.txt')).toEqual(classify('mode-auto'));
  });
});

describe('version commands (judgments: spec/judgments.md, oracle 2.1.319)', () => {
  test('node -v, node --version, python --version and python3 --version are read-only, alone', () => {
    for (const command of ['node -v', 'node --version', 'python --version', 'python3 --version']) {
      expect(bash('default', command)).toEqual(allow('read-only-command'));
    }
  });

  test('other version forms ask', () => {
    for (const command of [
      'node -V',
      'node --version x',
      'node -v -e 1',
      'python3 -V',
      'npm -v',
      'bun --version',
      'go version',
    ]) {
      expect(bash('default', command)).toEqual(ask('default-prompt'));
    }
  });
});
