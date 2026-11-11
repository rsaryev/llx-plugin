/**
 * cli-reference.md § CLI flags (`--bare`: skip auto-discovery of hooks, skills, custom commands,
 * subagents, installed plugins, MCP servers, auto memory and CLAUDE.md, skills in an `--add-dir`
 * still load, sets `CLAUDE_CODE_SIMPLE`; `--safe-mode`: CLAUDE.md, skills, plugins, hooks, MCP
 * servers, custom commands and agents, output styles, workflows, custom themes, custom keybindings,
 * status line and file-suggestion commands, LSP servers and auto memory do not load, managed policy
 * still applies to hooks, status line and file-suggestion commands and not to managed plugins,
 * skills, CLAUDE.md and MCP servers, sets `CLAUDE_CODE_SAFE_MODE`; `--restricted`: removes the
 * tools that run commands or code and WebFetch unless `--tools` names them individually, confines
 * the file tools to the working directories, loads only managed settings and `--settings`, refuses
 * `bypassPermissions` and cloud sessions; `--disable-slash-commands`: disables all skills and
 * commands), headless.md § Start faster with bare mode (a flag-loaded plugin and `--add-dir` skills
 * still load; `.claude/commands/` and `.claude/agents/` of an added directory do not) and env-vars.md
 * (`CLAUDE_CODE_SIMPLE`, `CLAUDE_CODE_SAFE_MODE` are set to `1`). What neither mode names stays
 * loaded, and bare mode's tool set is not named in the docs: outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import { managedPolicyUnderSafeMode } from '../../src/cli/flags/modes.ts';
import { CUSTOMIZATIONS, type Customization } from '../../src/cli/flags/types.ts';
import { availableTools } from '../../src/rules/index.ts';
import { planOf } from '../support/session-flags.ts';
import { spec } from '../support/spec.ts';

const sorted = (list: readonly string[]): string[] => list.toSorted();

spec('cli.flag.--bare', () => {
  test('skips exactly hooks, skills, custom commands, subagents, installed plugins, MCP servers, auto memory and CLAUDE.md', () => {
    expect(sorted(planOf({ '--bare': true }).skipped)).toEqual(
      sorted([
        'hooks',
        'skills',
        'commands',
        'agents',
        'installed-plugins',
        'mcp-servers',
        'auto-memory',
        'claude-md',
      ]),
    );
  });

  test('sets CLAUDE_CODE_SIMPLE to 1', () => {
    expect(planOf({ '--bare': true }).env).toEqual({ CLAUDE_CODE_SIMPLE: '1' });
  });

  test('never reads OAuth credentials or the system keychain, unlike every other mode', () => {
    expect(planOf({ '--bare': true }).readsStoredCredentials).toBe(false);
    expect(planOf({}).readsStoredCredentials).toBe(true);
    expect(planOf({ '--safe-mode': true }).readsStoredCredentials).toBe(true);
  });

  test('a plugin passed with --plugin-dir still loads: only installed plugins are skipped', () => {
    const plan = planOf({ '--bare': true, '--plugin-dir': ['./p'] });
    expect(plan.skipped).toContain('installed-plugins');
    expect(plan.sessionPlugins).toHaveLength(1);
  });

  test('skills of an --add-dir directory still load; its commands and agents folders do not', () => {
    const plan = planOf(
      { '--bare': true, '--add-dir': ['/work/shared'] },
      { directories: { '/work/shared': 'directory' } },
    );
    expect(plan.addDirLoads).toContain('skills');
    expect(plan.addDirLoads).not.toContain('commands');
    expect(plan.addDirLoads).not.toContain('agents');
  });

  test('leaves loaded what the flag does not name', () => {
    const skipped = planOf({ '--bare': true }).skipped;
    for (const kept of ['output-styles', 'status-line', 'lsp-servers', 'keybindings'] as const) {
      expect(skipped).not.toContain(kept);
    }
  });

  test('without the flag nothing is skipped and nothing is set', () => {
    const plan = planOf({});
    expect(plan.skipped).toEqual([]);
    expect(plan.env).toEqual({});
  });
});

spec(
  [
    'cli.flag.--safe-mode',
    'cli.debug.Test against a clean configuration',
    'cli.debug.Test against a clean configuration.CLAUDE.md',
  ],
  () => {
    test('skips every customization the docs list', () => {
      expect(sorted(planOf({ '--safe-mode': true }).skipped)).toEqual(
        sorted([
          'claude-md',
          'skills',
          'installed-plugins',
          'hooks',
          'mcp-servers',
          'commands',
          'agents',
          'output-styles',
          'workflows',
          'themes',
          'keybindings',
          'status-line',
          'file-suggestion',
          'lsp-servers',
          'auto-memory',
        ]),
      );
    });

    test('sets CLAUDE_CODE_SAFE_MODE to 1', () => {
      expect(planOf({ '--safe-mode': true }).env).toEqual({ CLAUDE_CODE_SAFE_MODE: '1' });
    });

    test('authentication, model selection, built-in tools and permissions are untouched', () => {
      const plan = planOf({ '--safe-mode': true, '--permission-mode': 'plan' });
      expect(plan.tools).toBeUndefined();
      expect(plan.permissionMode).toBe('plan');
      expect(plan.restricted).toBe(false);
      expect(plan.settingScopes).toBeUndefined();
    });

    test('skips more than --bare does: output styles, workflows, themes and keybindings load under bare', () => {
      const bare = planOf({ '--bare': true }).skipped;
      const safe = planOf({ '--safe-mode': true }).skipped;
      expect(safe.length).toBeGreaterThan(bare.length);
      for (const kind of bare) expect(safe).toContain(kind);
      expect(bare).not.toContain('output-styles');
      expect(safe).toContain('output-styles');
    });

    test('managed policy still applies to hooks, status line and file-suggestion commands', () => {
      for (const kind of ['hooks', 'status-line', 'file-suggestion'] as const) {
        expect(managedPolicyUnderSafeMode(kind)).toBe(true);
      }
    });

    test('managed plugins, skills, CLAUDE.md and MCP servers do not load', () => {
      for (const kind of ['installed-plugins', 'skills', 'claude-md', 'mcp-servers'] as const) {
        expect(managedPolicyUnderSafeMode(kind)).toBe(false);
      }
    });

    test('the docs say nothing of the managed layer of the other kinds', () => {
      const named = new Set<Customization>([
        'hooks',
        'status-line',
        'file-suggestion',
        'installed-plugins',
        'skills',
        'claude-md',
        'mcp-servers',
      ]);
      for (const kind of CUSTOMIZATIONS.filter((one) => !named.has(one))) {
        expect(managedPolicyUnderSafeMode(kind)).toBeUndefined();
      }
    });
  },
);

spec('cli.flag.--disable-slash-commands', () => {
  test('disables all skills and commands, and nothing else', () => {
    expect(sorted(planOf({ '--disable-slash-commands': true }).skipped)).toEqual([
      'commands',
      'skills',
    ]);
  });

  test('sets no variable and starts no other restriction', () => {
    const plan = planOf({ '--disable-slash-commands': true });
    expect(plan.env).toEqual({});
    expect(plan.restricted).toBe(false);
  });
});

describe('--restricted', () => {
  const candidates = ['Bash', 'PowerShell', 'Monitor', 'WebFetch', 'Read', 'Edit'];
  const tools = (given: Parameters<typeof planOf>[0]) => {
    const plan = planOf(given);
    return availableTools(candidates, {
      platform: 'posix',
      rules: [],
      restricted: plan.restricted,
      ...(plan.tools === undefined ? {} : { toolsFlag: plan.tools }),
    });
  };

  spec('cli.flag.--restricted', () => {
    test('removes the tools that run commands or code, and WebFetch', () => {
      expect(tools({ '--restricted': true })).toEqual(['Read', 'Edit']);
    });

    test('--tools naming a removed tool individually brings it back; the default preset does not', () => {
      expect(tools({ '--restricted': true, '--tools': 'Bash,Read' })).toEqual(['Bash', 'Read']);
      expect(tools({ '--restricted': true, '--tools': 'default' })).toEqual(['Read', 'Edit']);
    });

    test('loads only managed settings and --settings', () => {
      expect(planOf({ '--restricted': true }).settingScopes).toEqual(['managed', 'parent', 'flag']);
    });

    test('confines the built-in file tools to the working directories and refuses cloud sessions', () => {
      const plan = planOf({ '--restricted': true });
      expect(plan.fileToolsConfined).toBe(true);
      expect(plan.cloudSessions).toBe('refused');
    });

    test('refuses bypassPermissions', () => {
      const plan = planOf({ '--restricted': true, '--permission-mode': 'bypassPermissions' });
      expect(plan.refusals).toHaveLength(1);
      expect(plan.refusals[0]).toContain('bypassPermissions');
      expect(planOf({ '--restricted': true, '--permission-mode': 'plan' }).refusals).toEqual([]);
    });

    test('a session that is not restricted keeps every tool and setting source', () => {
      expect(tools({})).toEqual(candidates);
      expect(planOf({}).settingScopes).toBeUndefined();
      expect(planOf({}).cloudSessions).toBe('allowed');
    });
  });

  test('--setting-sources narrows what --restricted loads, never widens it', () => {
    const plan = planOf({ '--restricted': true, '--setting-sources': 'user,project' });
    expect(plan.settingScopes).toEqual(['managed', 'parent', 'flag']);
  });
});
