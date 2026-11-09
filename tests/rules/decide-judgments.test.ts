/**
 * The choices spec/judgments.md records for `decide` where permissions.md and permission-modes.md
 * are silent. Outside spec() on purpose: a judgment never counts as compatibility.
 */
import { describe, expect, test } from 'bun:test';
import { decide } from '../../src/rules/index.ts';
import {
  allow,
  ask,
  baseContext,
  bash,
  decision,
  deny,
  onPath,
  rulesOf,
} from '../support/decide.ts';
import { call } from '../support/rule-context.ts';

/** The catalog flag a host passes: every tool but TodoWrite needs permission. */
const requiresPermission = (name: string) => name !== 'TodoWrite';

describe('the read-only set: the documented names, plus a seed of read-only git forms', () => {
  test('git status, log, diff and show are read-only; other git forms are not', () => {
    for (const command of ['git status', 'git log --oneline', 'git diff HEAD', 'git show abc']) {
      expect(bash('default', command)).toEqual(allow('read-only-command'));
    }
    for (const command of ['git push', 'git commit -m x', 'git checkout main', 'git -C . status']) {
      expect(bash('default', command)).toEqual(ask('default-prompt'));
    }
  });

  test('git branch that only lists is read-only; one that names a branch or deletes is not', () => {
    for (const command of ['git branch', 'git branch --show-current', 'git branch -a -v']) {
      expect(bash('default', command)).toEqual(allow('read-only-command'));
    }
    for (const command of ['git branch topic', 'git branch -d topic', 'git branch -m old new']) {
      expect(bash('default', command)).toEqual(ask('default-prompt'));
    }
  });

  test('a git read form that writes a file through --output prompts', () => {
    for (const command of ['git diff --output=patch.txt', 'git log --output patch.txt']) {
      expect(bash('default', command)).toEqual(ask('default-prompt'));
    }
  });

  test('git with an unquoted glob prompts (a glob could expand to a write-capable flag)', () => {
    expect(bash('default', 'git diff *.ts')).toEqual(ask('default-prompt'));
  });

  test('wrappers and environment assignments in front are not seen through for the read-only set', () => {
    expect(bash('default', 'timeout 5 ls')).toEqual(ask('default-prompt'));
    expect(bash('default', 'LANG=C ls')).toEqual(ask('default-prompt'));
  });

  test('a redirect other than to /dev/null or a descriptor makes a read-only command prompt', () => {
    expect(bash('default', 'ls > out.txt')).toEqual(ask('default-prompt'));
    expect(bash('default', 'cat < input.txt')).toEqual(ask('default-prompt'));
    expect(bash('default', 'ls 2>/dev/null')).toEqual(allow('read-only-command'));
    expect(bash('default', 'ls 2>&1')).toEqual(allow('read-only-command'));
  });

  test('PowerShell commands are not in the read-only set', () => {
    expect(decision('default', 'PowerShell', { command: 'Get-ChildItem' })).toEqual(
      ask('default-prompt'),
    );
  });
});

describe('acceptEdits shell commands: operands', () => {
  test('a glob or a variable operand is not resolved, so it prompts', () => {
    expect(bash('acceptEdits', 'rm build/*')).toEqual(ask('default-prompt'));
    expect(bash('acceptEdits', 'mv a "$DEST"')).toEqual(ask('default-prompt'));
  });

  test('a path with ~ is resolved against the home directory', () => {
    expect(bash('acceptEdits', 'cp a.txt ~/backup/a.txt')).toEqual(ask('default-prompt'));
  });

  test('relative operands follow a cd earlier in the command', () => {
    expect(bash('acceptEdits', 'cd /etc && rm hosts')).toEqual(ask('default-prompt'));
    expect(bash('acceptEdits', 'cd src && rm old.ts')).toEqual(allow('accept-edits'));
  });

  test('for sed the first operand is the script, not a path', () => {
    expect(bash('acceptEdits', "sed -n '/x/p' src/a.ts")).toEqual(allow('accept-edits'));
  });
});

describe('tools and prompts the docs leave open', () => {
  test('a tool whose permission is not required runs; the host passes the catalog flag', () => {
    expect(decision('default', 'TodoWrite', { todos: [] }, { requiresPermission })).toEqual(
      allow('no-permission-required'),
    );
    expect(decision('default', 'Agent', { prompt: 'x' }, { requiresPermission })).toEqual(
      ask('default-prompt'),
    );
  });

  test('without the flag every tool outside the read-only set needs permission', () => {
    expect(decision('default', 'TodoWrite', { todos: [] })).toEqual(ask('default-prompt'));
  });

  test('an MCP tool asks until it is allowed (its first-use prompt)', () => {
    expect(decision('default', 'mcp__github__create_issue', {})).toEqual(ask('default-prompt'));
    expect(
      decision(
        'default',
        'mcp__github__create_issue',
        {},
        { rules: rulesOf(['allow', 'mcp__github']) },
      ),
    ).toEqual(allow('allow-rule'));
  });

  test('a mod approval does not approve what no mode auto-approves', () => {
    const mod = { approved: true, policyEnforced: false };
    expect(bash('default', 'rm -rf ~', { mod })).toEqual(ask('critical-path'));
    expect(onPath('default', 'Write', '/work/app/.git/config', { mod })).toEqual(
      ask('protected-path'),
    );
    expect(onPath('default', 'Read', '/net/fileserver/a', { mod })).toEqual(ask('network-path'));
  });

  test('a hook allow does not approve a protected-path write, like an allow rule', () => {
    expect(
      onPath('default', 'Write', '/work/app/.git/config', { hook: { decision: 'allow' } }),
    ).toEqual(ask('protected-path'));
  });

  test('a bare tool deny rule denies a call of that tool', () => {
    expect(
      decision(
        'default',
        'WebFetch',
        { url: 'https://example.com', prompt: 'x' },
        {
          rules: rulesOf(['deny', 'WebFetch']),
        },
      ),
    ).toEqual(deny('deny-rule'));
  });

  test('a file-reading tool outside the working directory with the block key on is denied before any rule', () => {
    expect(
      onPath('default', 'Grep', '/etc', {
        blockReadsOutsideWorkingDirectories: true,
        rules: rulesOf(['allow', 'Grep']),
      }),
    ).toEqual(deny('outside-working-directory'));
  });

  test('a call that is not an object or has no path field is an ordinary tool call', () => {
    expect(decide(call('Read', 'oops'), baseContext('default'))).toEqual(ask('default-prompt'));
    expect(decide(call('Write', {}), baseContext('default'))).toEqual(ask('default-prompt'));
  });

  test('a bare ~ path is the home directory, ~/x is below it', () => {
    expect(onPath('default', 'Read', '~/notes.txt')).toEqual(ask('default-prompt'));
    expect(
      onPath('default', 'Read', '~/notes.txt', {
        match: {
          paths: {
            cwd: '/home/alice',
            home: '/home/alice',
            primaryWorkingDirectory: '/home/alice',
            additionalDirectories: [],
            platform: 'posix',
          },
        },
      }),
    ).toEqual(allow('read-in-working-directory'));
  });

  test('the critical-path variable-plus-directory form is limited to the four documented names', () => {
    expect(bash('default', 'rm -rf "$X/mnt"')).toEqual(ask('critical-path'));
    expect(bash('default', 'rm -rf "$X/tmp"')).toEqual(ask('critical-path'));
    expect(bash('default', 'rm -rf "$X/usr"')).toEqual(ask('critical-path'));
    expect(bash('default', 'rm -rf "$X/Users"')).toEqual(ask('critical-path'));
    expect(bash('default', 'rm -rf "$X/build"')).toEqual(ask('default-prompt'));
  });
});

describe('plan mode: what a call that does not run gets', () => {
  test('a file edit that no rule approves asks, with the reason mode-plan, and does not deny', () => {
    expect(onPath('plan', 'Edit', '/work/app/a.ts')).toEqual(ask('mode-plan'));
    expect(bash('plan', 'npm test')).toEqual(ask('mode-plan'));
  });

  test('an allow rule approves what it covers, as in default mode', () => {
    expect(bash('plan', 'npm test', { rules: rulesOf(['allow', 'Bash(npm test)']) })).toEqual(
      allow('allow-rule'),
    );
  });
});

describe('what the host answers for a removal it cannot ask about', () => {
  test('bypassPermissions leaves the prompt to the host; auto denies away from a terminal', () => {
    expect(bash('bypassPermissions', 'rm -rf ~', { interactive: false })).toEqual(
      ask('critical-path'),
    );
    expect(bash('auto', 'rm -rf ~', { interactive: false })).toEqual(deny('critical-path'));
  });
});

describe('EndConversation', () => {
  test('runs whatever a hook or the mode says, because decide cannot see the tool list', () => {
    for (const mode of ['default', 'dontAsk', 'bypassPermissions'] as const) {
      expect(
        decision(
          mode,
          'EndConversation',
          {},
          { hook: { decision: 'deny' }, rules: rulesOf(['deny', 'EndConversation']) },
        ),
      ).toEqual(allow('no-permission-required'));
    }
  });
});

describe('the symlink scope', () => {
  test('a path whose resolved location is outside the working directory is not in scope', () => {
    const resolved = {
      toolName: 'Read',
      input: { file_path: '/work/app/link' },
      resolvedPaths: ['/etc/shadow'],
    };
    expect(decide(resolved, baseContext('default'))).toEqual(ask('default-prompt'));
  });
});
