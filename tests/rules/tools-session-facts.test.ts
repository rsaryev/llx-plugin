/**
 * tools-reference.md § Glob tool behavior, § Bash deny rules also turn off the PowerShell tool, the
 * tools table (`ExitWorktree`) and § Task tool availability; cli-reference.md § `--tools` and
 * `--restricted`. The session facts of `availableTools` beyond deny rules.
 */
import { describe, expect, test } from 'bun:test';
import { availableTools, type ToolSession } from '../../src/rules/tools/availability.ts';
import { parsed } from '../support/rule-context.ts';
import { spec } from '../support/spec.ts';

const session = (
  rules: readonly (readonly [string, 'deny' | 'allow'])[] = [],
  rest: Partial<ToolSession> = {},
): ToolSession => ({
  platform: 'windows',
  rules: rules.map(([text, behavior]) => parsed(text, behavior)),
  ...rest,
});

const posix = (rest: Partial<ToolSession> = {}) => session([], { platform: 'posix', ...rest });
const gitBash = (rules: readonly (readonly [string, 'deny' | 'allow'])[], rest = {}) =>
  session(rules, { gitBash: true, ...rest });

describe('cli-reference.md § --tools: "default" is the default set', () => {
  const tools = ['Bash', 'Read', 'Glob', 'Grep', 'mcp__github__get_issue'];

  test('on Windows it restricts nothing', () => {
    expect(availableTools(tools, session([], { toolsFlag: ['default'] }))).toEqual(tools);
  });

  test('on posix it keeps the default set, which leaves out Glob and Grep', () => {
    expect(availableTools(tools, posix({ toolsFlag: ['default'] }))).toEqual([
      'Bash',
      'Read',
      'mcp__github__get_issue',
    ]);
  });

  test('beside a tool name it adds that tool to the default set', () => {
    expect(availableTools(tools, posix({ toolsFlag: ['default', 'Grep'] }))).toEqual([
      'Bash',
      'Read',
      'Grep',
      'mcp__github__get_issue',
    ]);
  });
});

describe('cli-reference.md § --restricted: removes the tools that run commands or code, and WebFetch', () => {
  const tools = ['Bash', 'PowerShell', 'Monitor', 'WebFetch', 'WebSearch', 'Read', 'Edit'];

  test('alone it removes Bash, PowerShell, Monitor and WebFetch', () => {
    expect(availableTools(tools, session([], { restricted: true }))).toEqual([
      'WebSearch',
      'Read',
      'Edit',
    ]);
  });

  test('--tools naming a tool individually keeps it', () => {
    const named = session([], { restricted: true, toolsFlag: ['Bash', 'WebFetch', 'Read'] });
    expect(availableTools(tools, named)).toEqual(['Bash', 'WebFetch', 'Read']);
  });

  test('the default preset does not name them: they are still removed', () => {
    const preset = session([], { restricted: true, toolsFlag: ['default'] });
    expect(availableTools(tools, preset)).toEqual(['WebSearch', 'Read', 'Edit']);
  });

  test('a Bash that --tools names keeps Glob and Grep out on posix', () => {
    const glob = ['Bash', 'Glob', 'Grep'];
    expect(availableTools(glob, posix({ restricted: true, toolsFlag: ['Bash'] }))).toEqual([
      'Bash',
    ]);
    expect(availableTools(glob, posix({ restricted: true }))).toEqual(['Glob', 'Grep']);
  });
});

spec(
  ['tools.tool.PowerShell', 'tools.behavior.Bash deny rules also turn off the PowerShell tool'],
  () => {
    describe('tools-reference.md § Bash deny rules also turn off the PowerShell tool', () => {
      const tools = ['Bash', 'PowerShell', 'Read'];
      test('a bare or scoped Bash deny rule turns PowerShell off on Windows with Git Bash', () => {
        expect(availableTools(tools, gitBash([['Bash(git push *)', 'deny']]))).toEqual([
          'Bash',
          'Read',
        ]);
        expect(availableTools(tools, gitBash([['Bash', 'deny']]))).toEqual(['Read']);
      });

      test('without Git Bash, on posix, or with no Bash deny rule it stays', () => {
        expect(availableTools(tools, session([['Bash(git push *)', 'deny']]))).toEqual(tools);
        const posixDeny = session([['Bash(git push *)', 'deny']], {
          platform: 'posix',
          gitBash: true,
        });
        expect(availableTools(tools, posixDeny)).toContain('PowerShell');
        expect(availableTools(tools, gitBash([['Read', 'deny']]))).toContain('PowerShell');
        expect(availableTools(tools, gitBash([['Bash(git push *)', 'allow']]))).toEqual(tools);
      });

      test('CLAUDE_CODE_USE_POWERSHELL_TOOL=1 keeps it', () => {
        const optIn = gitBash([['Bash(git push *)', 'deny']], { powerShellOptIn: true });
        expect(availableTools(tools, optIn)).toEqual(tools);
      });

      test('a scoped PowerShell rule keeps it', () => {
        const scoped = gitBash([
          ['Bash(git push *)', 'deny'],
          ['PowerShell(git push *)', 'deny'],
        ]);
        expect(availableTools(tools, scoped)).toEqual(tools);
      });
    });
  },
);

spec(['tools.tool.EnterWorktree', 'tools.tool.ExitWorktree'], () => {
  describe('tools-reference.md § tools table, ExitWorktree; § EnterWorktree tool behavior: removed once permissions.blockWritesOutsideWorkingDirectories is on', () => {
    const tools = ['Read', 'EnterWorktree', 'ExitWorktree'];

    test('both worktree tools are removed', () => {
      const blocked = session([], { blockWritesOutsideWorkingDirectories: true });
      expect(availableTools(tools, blocked)).toEqual(['Read']);
    });

    test('they stay when it is off', () => {
      expect(availableTools(tools, session())).toEqual(tools);
      expect(
        availableTools(tools, session([], { blockWritesOutsideWorkingDirectories: false })),
      ).toEqual(tools);
    });
  });
});

describe('judgment: the host decides which task tools are candidates', () => {
  const tasks = ['TaskCreate', 'TodoWrite', 'Read'];

  test('availableTools never adds a tool the host did not offer', () => {
    expect(availableTools(['Read'], session([], { toolsFlag: ['TaskCreate', 'Read'] }))).toEqual([
      'Read',
    ]);
  });

  test('a --tools list naming a task tool keeps it among the candidates and drops the others', () => {
    expect(availableTools(tasks, session([], { toolsFlag: ['TaskCreate', 'Read'] }))).toEqual([
      'TaskCreate',
      'Read',
    ]);
  });
});
