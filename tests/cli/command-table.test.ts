/**
 * cli-reference.md § CLI commands (`claude plugin`: "Manage Claude Code plugins. Alias: `claude
 * plugins`", with its subcommands in plugins/cli-reference.md; `claude agents`, `claude mcp`,
 * `claude mcp login <name>` and `claude mcp logout <name>` are other product features the kit does
 * not run); plugins/cli-reference.md § claude plugin commands (the aliases `i`, `remove`, `rm`,
 * `autoremove` and `new`) and § plugin marketplace remove (`rm`); plugins/troubleshooting.md (`claude
 * plugin add <source>` is `unknown command 'add'`). The delegated rows are recorded, not proven:
 * the four ids of the other commands are proposed to the owner for spec/out-of-scope.json.
 */
import { describe, expect, test } from 'bun:test';
import {
  COMMAND_TABLE,
  MARKETPLACE_SUBCOMMANDS,
  PLUGIN_SUBCOMMANDS,
  resolveCommand,
} from '../../src/cli/command-table.ts';
import { spec } from '../support/spec.ts';

const commandOf = (...words: string[]): string | undefined => resolveCommand(words)?.command;

spec('cli.command.claude plugin', () => {
  test('claude plugins is an alias for claude plugin', () => {
    expect(commandOf('plugins')).toBe('plugin');
    expect(commandOf('plugins', 'install', 'a@m')).toBe('plugin install');
    expect(resolveCommand(['plugins', 'install', 'a@m'])?.rest).toEqual(['a@m']);
  });

  test('claude plugin takes each documented subcommand', () => {
    expect(new Set<string>(PLUGIN_SUBCOMMANDS)).toEqual(
      new Set([
        'init',
        'install',
        'uninstall',
        'enable',
        'disable',
        'update',
        'list',
        'details',
        'configure',
        'prune',
        'eval',
        'tag',
        'test',
        'validate',
        'marketplace',
      ]),
    );
    for (const subcommand of PLUGIN_SUBCOMMANDS) {
      expect(commandOf('plugin', subcommand)).toBe(`plugin ${subcommand}`);
    }
  });

  test('the aliases of the subcommands resolve to them', () => {
    expect(commandOf('plugin', 'i')).toBe('plugin install');
    expect(commandOf('plugin', 'remove')).toBe('plugin uninstall');
    expect(commandOf('plugin', 'rm')).toBe('plugin uninstall');
    expect(commandOf('plugin', 'autoremove')).toBe('plugin prune');
    expect(commandOf('plugin', 'new')).toBe('plugin init');
  });

  test('the marketplace subcommands are add, list, remove (alias rm) and update', () => {
    expect(new Set<string>(MARKETPLACE_SUBCOMMANDS)).toEqual(
      new Set(['add', 'list', 'remove', 'update']),
    );
    expect(commandOf('plugin', 'marketplace', 'rm', 'x')).toBe('plugin marketplace remove');
    expect(commandOf('plugins', 'marketplace', 'add', 'o/r')).toBe('plugin marketplace add');
  });

  test('a word that is no subcommand is unknown, as `claude plugin add` is', () => {
    expect(resolveCommand(['plugin', 'add', './x'])).toBeUndefined();
    expect(resolveCommand(['plugin', 'marketplace', 'refresh'])).toBeUndefined();
  });

  test('i and rm are not top-level commands', () => {
    expect(resolveCommand(['i'])).toBeUndefined();
    expect(resolveCommand(['remove'])).toBeUndefined();
  });

  test('plugin commands are modelled by the kit', () => {
    expect(resolveCommand(['plugin', 'install'])?.handling).toBe('planned');
    expect(resolveCommand(['plugin', 'marketplace', 'add'])?.handling).toBe('planned');
  });
});

describe('the commands of other product features', () => {
  test('agents, mcp, mcp login and mcp logout are host-delegated rows', () => {
    for (const words of [['agents'], ['mcp'], ['mcp', 'login'], ['mcp', 'logout']]) {
      expect(resolveCommand(words)?.handling).toBe('host-delegated');
    }
    expect(commandOf('mcp', 'login', 'sentry')).toBe('mcp login');
    expect(resolveCommand(['mcp', 'login', 'sentry', '--no-browser'])?.rest).toEqual([
      'sentry',
      '--no-browser',
    ]);
    expect(commandOf('mcp', 'logout', 'sentry')).toBe('mcp logout');
  });

  test('an mcp subcommand the table does not list stays with claude mcp', () => {
    const resolved = resolveCommand(['mcp', 'add', 'sentry']);
    expect(resolved?.command).toBe('mcp');
    expect(resolved?.rest).toEqual(['add', 'sentry']);
  });

  test('claude agents keeps its flags for the host', () => {
    expect(resolveCommand(['agents', '--json'])).toMatchObject({
      command: 'agents',
      rest: ['--json'],
    });
  });

  test('every row of the table has a handling', () => {
    for (const row of Object.values(COMMAND_TABLE)) {
      expect(['planned', 'host-delegated']).toContain(row.handling);
    }
  });
});
