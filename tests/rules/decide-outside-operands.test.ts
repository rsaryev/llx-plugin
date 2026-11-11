/**
 * The files a recognized Bash file command names, judged like its redirect targets (permissions.md,
 * "What `Read` and `Edit` rules cover", "Redirections", "Working directories"), as Claude Code 2.1.322
 * answered in the Bash tool and in a skill's `!` block alike (spec/judgments.md). A path outside the
 * working directories needs approval: a prefix rule such as `Bash(cat *)` and a bare `Read` allow do
 * not give it, a path-specific `Read` or `Edit` allow does, a tool-wide `Bash` allow and
 * `bypassPermissions` lift it, a `Read` or `Edit` deny denies. So does an operand a variable hides
 * and a `..` after a directory segment. The prompt is the mode's: auto mode classifies, dontAsk denies.
 */
import { describe, expect, test } from 'bun:test';
import type { PermissionBehavior } from '../../src/protocol/official.ts';
import { decide } from '../../src/rules/index.ts';
import {
  allow,
  ask,
  baseContext,
  bash,
  classify,
  deny,
  pathsWith,
  rulesOf,
} from '../support/decide.ts';

type RuleEntry = [PermissionBehavior, string];
const PROMPTS = ask('default-prompt');
const RUNS = allow('read-only-command');
const withRules = (...entries: RuleEntry[]) => ({ rules: rulesOf(...entries) });
const extra = { match: pathsWith({ additionalDirectories: ['/work/extra'] }) };

describe('a read outside the working directories', () => {
  test('is asked for each recognized file command, and runs inside', () => {
    for (const command of [
      'cat /etc/hosts',
      'ls /nonexistent-probe',
      'head -n1 /etc/hosts',
      'grep x /etc/hosts',
      'grep -f /etc/hosts a.txt',
      'find . -newer /etc/hosts',
      'wc -l ../other/a.txt',
      'cat a.txt /etc/hosts',
      'cat -- /etc/hosts',
      'ls ~',
      'cat ~/notes.txt',
      'ls /etc/*',
      'cat /etc/hos?',
    ]) {
      expect([command, bash('default', command)]).toEqual([command, PROMPTS]);
    }
    for (const command of ['cat a.txt', 'ls *.txt', 'cat ../app/a.txt', 'cat ./../app/a.txt']) {
      expect([command, bash('default', command)]).toEqual([command, RUNS]);
    }
    expect(bash('default', 'cat /work/extra/e.txt', extra)).toEqual(RUNS);
  });

  test('a variable or substitution in an operand is asked', () => {
    expect(bash('default', 'cat $UNSET')).toEqual(PROMPTS);
    expect(bash('default', 'cat $(echo a.txt)')).toEqual(PROMPTS);
  });

  test('a `..` after a directory segment is asked, in scope too', () => {
    for (const command of ['ls sub/..', 'cat sub/../a.txt', 'cat /work/app/sub/../a.txt']) {
      expect([command, bash('default', command)]).toEqual([command, PROMPTS]);
    }
    expect(bash('default', 'ls /tmp/../etc', withRules(['allow', 'Read(//etc/**)']))).toEqual(
      PROMPTS,
    );
  });

  test('a prefix or exact Bash rule and a bare Read allow leave it asked', () => {
    for (const rule of [
      'Bash(cat *)',
      'Bash(cat:*)',
      'Bash(cat /etc/hosts)',
      'Read',
      'Read(/**)',
    ]) {
      expect([rule, bash('default', 'cat /etc/hosts', withRules(['allow', rule]))]).toEqual([
        rule,
        PROMPTS,
      ]);
    }
  });

  test('a path-specific Read allow runs it; a tool-wide Bash allow runs it', () => {
    expect(bash('default', 'cat /etc/hosts', withRules(['allow', 'Read(//etc/**)']))).toEqual(RUNS);
    for (const rule of ['Bash', 'Bash(*)']) {
      expect(bash('default', 'cat /etc/hosts', withRules(['allow', rule]))).toEqual(
        allow('allow-rule'),
      );
    }
  });

  test('a Read deny denies it', () => {
    expect(bash('default', 'cat /etc/hosts', withRules(['deny', 'Read(//etc/**)']))).toEqual(
      deny('deny-rule'),
    );
  });

  test('the prompt is the mode’s', () => {
    expect(bash('acceptEdits', 'cat /etc/hosts')).toEqual(PROMPTS);
    expect(bash('dontAsk', 'cat /etc/hosts')).toEqual(deny('mode-dontask'));
    expect(bash('auto', 'cat /etc/hosts', { autoAvailable: true })).toEqual(classify('mode-auto'));
    expect(
      bash('auto', 'cat /etc/hosts', {
        autoAvailable: true,
        ...withRules(['allow', 'Bash(cat *)']),
      }),
    ).toEqual(classify('mode-auto'));
    expect(bash('bypassPermissions', 'cat /etc/hosts')).toEqual(allow('mode-bypass'));
  });

  test('a symlink the host resolved outside is asked', () => {
    const call = {
      toolName: 'Bash',
      input: { command: 'cat link' },
      resolvedPaths: ['/outside/o.txt'],
    };
    expect(decide(call, baseContext('default'))).toEqual(PROMPTS);
  });

  test('the commands Claude Code does not path-check run outside under their prefix rule', () => {
    for (const program of ['less', 'xxd', 'du', 'chmod 644']) {
      const command = `${program} /etc/hosts`;
      const rule = `Bash(${program.split(' ')[0]} *)`;
      expect([command, bash('default', command, withRules(['allow', rule]))]).toEqual([
        command,
        allow('allow-rule'),
      ]);
    }
  });
});

describe('a write outside the working directories', () => {
  test('is asked despite a prefix rule; a path-specific Edit allow runs it, an Edit deny denies it', () => {
    const touch = (...entries: RuleEntry[]) =>
      bash('default', 'touch /tmp/x', withRules(['allow', 'Bash(touch *)'], ...entries));
    expect(touch()).toEqual(PROMPTS);
    expect(touch(['allow', 'Edit(//tmp/**)'])).toEqual(allow('allow-rule'));
    expect(touch(['deny', 'Edit(//tmp/**)'])).toEqual(deny('deny-rule'));
    expect(bash('default', 'cp a.txt /tmp/b', withRules(['allow', 'Bash(cp *)']))).toEqual(PROMPTS);
    expect(bash('default', 'touch zz', withRules(['allow', 'Bash(touch *)']))).toEqual(
      allow('allow-rule'),
    );
  });
});

describe('redirect targets under a tool-wide Bash allow', () => {
  test('run, in scope and out; a prefix rule and a bare Read allow do not cover them', () => {
    for (const command of ['cat < /etc/hosts', 'echo x > /tmp/w', 'echo x > in.txt']) {
      expect([command, bash('default', command, withRules(['allow', 'Bash']))]).toEqual([
        command,
        allow('allow-rule'),
      ]);
    }
    expect(bash('default', 'cat < /etc/hosts', withRules(['allow', 'Read']))).toEqual(PROMPTS);
    expect(bash('default', 'echo x > /tmp/w', withRules(['allow', 'Bash(echo *)']))).toEqual(
      PROMPTS,
    );
  });
});
