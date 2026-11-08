/**
 * cli-reference.md § CLI flags (`--permission-mode`: `default`, `acceptEdits`, `plan`, `auto`,
 * `dontAsk`, `bypassPermissions`, or `manual` as an alias for `default`, overriding `defaultMode`;
 * `--tools`: `""` disables all, `"default"` the default set, or tool names like `"Bash,Edit,Read"`,
 * the default set leaves out `Glob` and `Grep` on macOS, Linux and WSL, a task-tracking tool named
 * there opts the session in, MCP tools are unaffected; `--add-dir`: extra working directories for
 * reading and editing files, each path must be a directory, most network paths cannot be added, most
 * `.claude/` configuration is not discovered from them), permissions.md § Additional directories
 * grant file access, not configuration, errors.md (`is a network path, which cannot be added as a
 * working directory`) and tools-reference.md § Task tool availability. The mode of a session is the
 * rules module's and the tool pool the host's; these tests prove the mapping and, through
 * `availableTools`, the outcome. The wording of a refusal is outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import { PERMISSION_MODES } from '../../src/protocol/permission-modes.ts';
import { availableTools } from '../../src/rules/index.ts';
import { planOf } from '../support/session-flags.ts';
import { spec } from '../support/spec.ts';

spec('cli.flag.--permission-mode', () => {
  test('accepts each of the six modes as given', () => {
    for (const mode of PERMISSION_MODES) {
      expect(planOf({ '--permission-mode': mode }).permissionMode).toBe(mode);
    }
  });

  test('manual is an alias for default', () => {
    expect(planOf({ '--permission-mode': 'manual' }).permissionMode).toBe('default');
  });

  test('any other value fails the run and lists what is accepted', () => {
    const plan = planOf({ '--permission-mode': 'yolo' });
    expect(plan.refusals).toHaveLength(1);
    expect(plan.refusals[0]).toContain('yolo');
    expect(plan.refusals[0]).toContain('acceptEdits');
    expect(plan.refusals[0]).toContain('manual');
    expect(plan.permissionMode).toBeUndefined();
  });

  test('matching is exact: modes are case-sensitive', () => {
    expect(planOf({ '--permission-mode': 'AcceptEdits' }).refusals).toHaveLength(1);
  });

  test('without the flag no mode is chosen, so the defaultMode of the settings stands', () => {
    expect(planOf({}).permissionMode).toBeUndefined();
  });
});

describe('--tools', () => {
  const candidates = [
    'Bash',
    'Edit',
    'Read',
    'Glob',
    'Grep',
    'EndConversation',
    'mcp__srv__lookup',
  ];
  const offered = (value: string | undefined) => {
    const plan = planOf(value === undefined ? {} : { '--tools': value });
    return availableTools(candidates, {
      platform: 'posix',
      rules: [],
      ...(plan.tools === undefined ? {} : { toolsFlag: plan.tools }),
    });
  };

  spec('cli.flag.--tools', () => {
    test('tool names restrict the built-in tools to the ones named', () => {
      expect(planOf({ '--tools': 'Bash,Edit,Read' }).tools).toEqual(['Bash', 'Edit', 'Read']);
      expect(offered('Bash,Edit,Read')).toEqual([
        'Bash',
        'Edit',
        'Read',
        'EndConversation',
        'mcp__srv__lookup',
      ]);
    });

    test('"" disables all built-in tools', () => {
      expect(planOf({ '--tools': '' }).tools).toEqual([]);
      expect(offered('').filter((name) => name !== 'EndConversation')).toEqual([
        'mcp__srv__lookup',
      ]);
    });

    test('"" removes EndConversation only when no MCP tools remain: with one it stays', () => {
      const plan = planOf({ '--tools': '' });
      const withoutMcp = availableTools(['EndConversation', 'Bash'], {
        platform: 'posix',
        rules: [],
        toolsFlag: plan.tools ?? [],
      });
      expect(withoutMcp).toEqual([]);
      expect(offered('')).toContain('EndConversation');
      expect(offered('Bash')).toContain('EndConversation');
    });

    test('"default" is the default set: on macOS, Linux and WSL it leaves out Glob and Grep', () => {
      expect(planOf({ '--tools': 'default' }).tools).toEqual(['default']);
      expect(offered('default')).toEqual([
        'Bash',
        'Edit',
        'Read',
        'EndConversation',
        'mcp__srv__lookup',
      ]);
      expect(offered(undefined)).toEqual([
        'Bash',
        'Edit',
        'Read',
        'EndConversation',
        'mcp__srv__lookup',
      ]);
    });

    test('naming Glob and Grep individually adds them', () => {
      expect(offered('Read,Glob,Grep')).toEqual(
        ['Glob', 'Grep', 'Read', 'EndConversation', 'mcp__srv__lookup'].toSorted(
          (a, b) => candidates.indexOf(a) - candidates.indexOf(b),
        ),
      );
    });

    test('the flag does not affect MCP tools', () => {
      expect(offered('Read')).toContain('mcp__srv__lookup');
    });

    test('naming a task-tracking tool opts the session in', () => {
      expect(planOf({ '--tools': 'Read,TaskCreate' }).optsIntoTaskTools).toBe(true);
      expect(planOf({ '--tools': 'TodoWrite' }).optsIntoTaskTools).toBe(true);
      expect(planOf({ '--tools': 'Read,Edit' }).optsIntoTaskTools).toBe(false);
      expect(planOf({}).optsIntoTaskTools).toBe(false);
    });

    test('names are separated by commas or spaces, and blanks are dropped', () => {
      expect(planOf({ '--tools': ' Bash, Edit  Read ,' }).tools).toEqual(['Bash', 'Edit', 'Read']);
    });
  });
});

describe('--add-dir', () => {
  const dirs = { '../apps': 'directory', '../lib': 'directory', './notes.txt': 'file' } as const;
  const add = (paths: string[], extra = {}) =>
    planOf({ '--add-dir': paths }, { directories: dirs, ...extra });

  spec('cli.flag.--add-dir', () => {
    test('adds each path as a working directory, in the order given', () => {
      expect(add(['../apps', '../lib']).additionalDirectories).toEqual(['../apps', '../lib']);
    });

    test('validates that each path exists as a directory', () => {
      const gone = add(['../apps', '../gone']);
      expect(gone.refusals).toEqual(['--add-dir: ../gone is not a directory']);
      const aFile = add(['./notes.txt']);
      expect(aFile.refusals).toEqual(['--add-dir: ./notes.txt is not a directory']);
      expect(aFile.additionalDirectories).toEqual([]);
    });

    test('a network path cannot be added: UNC on Windows, /net on macOS and Linux', () => {
      const unc = add(['\\\\server\\share'], { platform: 'windows' });
      expect(unc.additionalDirectories).toEqual([]);
      expect(unc.refusals).toEqual([]);
      expect(unc.warnings[0]?.message).toBe(
        '\\\\server\\share is a network path, which cannot be added as a working directory',
      );
      expect(add(['/net/fileserver/notes'], {}).additionalDirectories).toEqual([]);
    });

    test('grants file access: skills, commands and agents load, and most other .claude configuration does not', () => {
      const loads = add(['../apps']).addDirLoads;
      expect(loads).toEqual([
        'skills',
        'commands',
        'agents',
        'settings:enabledPlugins',
        'settings:extraKnownMarketplaces',
      ]);
      expect(loads).not.toContain('claude-md');
    });

    test('CLAUDE.md files load only when CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1', () => {
      const on = add(['../apps'], { env: { CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD: '1' } });
      expect(on.addDirLoads).toContain('claude-md');
    });

    test('without the flag no directory is added and nothing extra loads', () => {
      expect(planOf({}).additionalDirectories).toEqual([]);
      expect(planOf({}).addDirLoads).toEqual([]);
    });
  });
});
