/**
 * Table rules beyond the formats: the rows of the settings index, the environment variables and
 * the CLI reference a host acts on. The tables list hundreds of Claude Code's own interface
 * and model switches; a row counts when its topic or its name concerns plugins, hooks, skills, MCP,
 * subagents, managed policy, updates, permissions or settings files (docs/SPEC.md).
 */
import type { TableRule } from './sources.ts';
import { FOREIGN_ENVIRONMENT, FOREIGN_FLAGS, PLUGIN_GLOBAL_ENV } from './row-scope.ts';

const id = (prefix: string) => (): string => prefix;

const SETTINGS = 'settings-reference.md';
const topic = (name: string) => (row: readonly string[]) => row[2] === name;
const KEPT_KEYS = new Set(['env', 'theme', 'outputStyle', 'statusLine']);
const key = (row: readonly string[]): string => (row[0] ?? '').replace(/\[?`([^`]+)`.*/, '$1');

const ENV_NAME =
  /PLUGIN|HOOK|SKILL|MCP|MANAGED|MARKETPLACE|MONITOR|CHANNEL|SUBAGENT|SESSION_ID|ENV_FILE|AUTOUPDATE|AUTO_UPDATE|UPDATES|CONFIG_DIR|SLASH_COMMAND|WORKFLOWS|SUBPROCESS_ENV|PROJECT_DIR|SIDELOAD|SEED|TMPDIR|CLAUDE_PID|^CLAUDECODE$/;
const FLAG_NAME =
  /plugin|mcp|setting|agent|add-dir|tools|permission-mode|channels|slash-commands|bare|safe-mode|restricted|marketplace/;

export const EXTRA_TABLE_RULES: readonly TableRule[] = [
  {
    category: 'permissions',
    page: SETTINGS,
    section: /^Settings index$/,
    prefix: id('permissions.setting'),
    where: topic('Permission settings'),
  },
  {
    category: 'mcp-settings',
    page: SETTINGS,
    section: /^Settings index$/,
    prefix: id('mcpSettings.key'),
    where: topic('MCP'),
  },
  {
    category: 'policy',
    page: SETTINGS,
    section: /^Settings index$/,
    prefix: id('policy.key'),
    where: topic('Enterprise and managed settings'),
  },
  {
    category: 'updates',
    page: SETTINGS,
    section: /^Settings index$/,
    prefix: id('updates.key'),
    where: topic('Updates and versioning'),
  },
  {
    category: 'settings',
    page: SETTINGS,
    section: /^Settings index$/,
    prefix: id('settings.key'),
    where: (row) => topic('Agents, sessions, and worktrees')(row) || KEPT_KEYS.has(key(row)),
  },
  {
    category: 'environment',
    page: 'env-vars.md',
    section: /^Variables$/,
    prefix: id('environment.host'),
    where: (row) =>
      FOREIGN_ENVIRONMENT[key(row)] === undefined &&
      (ENV_NAME.test(key(row)) || PLUGIN_GLOBAL_ENV.has(key(row))),
    excludedRowReason: (row) => FOREIGN_ENVIRONMENT[key(row)] ?? 'runtime',
  },
  {
    category: 'cli',
    page: 'cli-reference.md',
    section: /^CLI commands$/,
    prefix: id('cli.command'),
    where: (row) => key(row) === 'claude plugin',
  },
  {
    category: 'cli',
    page: 'cli-reference.md',
    section: /^CLI flags$/,
    prefix: id('cli.flag'),
    where: (row) => FLAG_NAME.test(key(row)) && !FOREIGN_FLAGS.has(key(row)),
  },
];
