/**
 * permissions.md § MCP (the three rule forms, the names with `.` or spaces, the plugin-scoped form,
 * a server with `__` or a trailing `_`, the deny-or-ask versus allow difference, the Cowork tools),
 * § Tool name wildcards (`mcp__*` and the allow anchor) and § Match by input parameter (an `mcp__`
 * rule with parentheses is skipped in a settings file); mcp.md § Plugin-provided MCP servers (the
 * callable name, the characters outside `A-Za-z0-9_-`).
 *
 * The requirements list has no id for an MCP rule form, so none of this is under spec(): the tests
 * assert the documented behaviour without counting towards the compatibility report.
 */
import { describe, expect, test } from 'bun:test';
import {
  evaluateRules,
  mcpToolName,
  mcpToolRuleMatches,
  normalizeMcpServerName,
  parseRule,
  pluginMcpServerName,
} from '../../src/rules/index.ts';
import { call, matchContext, parsed } from '../support/rule-context.ts';
import { covers } from '../support/target-rules.ts';

const BEHAVIORS = ['allow', 'ask', 'deny'] as const;
const tool = (name: string) => [name, {}] as const;

describe('the three MCP rule forms (permissions.md § MCP)', () => {
  test('mcp__<server> matches any tool provided by that server', () => {
    for (const behavior of BEHAVIORS) {
      expect(
        covers(behavior, 'mcp__puppeteer', ...tool('mcp__puppeteer__puppeteer_navigate')),
      ).toBe(true);
      expect(
        covers(behavior, 'mcp__puppeteer', ...tool('mcp__puppeteer__puppeteer_screenshot')),
      ).toBe(true);
    }
  });

  test('mcp__<server>__* uses wildcard syntax and also matches all tools of the server', () => {
    for (const behavior of BEHAVIORS) {
      expect(
        covers(behavior, 'mcp__puppeteer__*', ...tool('mcp__puppeteer__puppeteer_navigate')),
      ).toBe(true);
      expect(covers(behavior, 'mcp__puppeteer__*', ...tool('mcp__puppeteer__other'))).toBe(true);
    }
  });

  test('mcp__<server>__<tool> matches that one tool', () => {
    for (const behavior of BEHAVIORS) {
      const rule = 'mcp__puppeteer__puppeteer_navigate';
      expect(covers(behavior, rule, ...tool('mcp__puppeteer__puppeteer_navigate'))).toBe(true);
      expect(covers(behavior, rule, ...tool('mcp__puppeteer__puppeteer_screenshot'))).toBe(false);
    }
  });

  test('a server rule never covers another server, a built-in tool or a longer server name', () => {
    for (const behavior of BEHAVIORS) {
      expect(covers(behavior, 'mcp__puppeteer', ...tool('mcp__github__get_issue'))).toBe(false);
      expect(covers(behavior, 'mcp__puppeteer', ...tool('mcp__puppeteer2__x'))).toBe(false);
      expect(covers(behavior, 'mcp__puppeteer', ...tool('mcp__puppeteer'))).toBe(true);
      expect(covers(behavior, 'mcp__puppeteer', ...tool('Bash'))).toBe(false);
      expect(covers(behavior, 'mcp__puppeteer__*', ...tool('mcp__github__x'))).toBe(false);
    }
  });

  test('a glob after the server prefix selects part of its tools (mcp__github__get_*)', () => {
    expect(covers('allow', 'mcp__github__get_*', ...tool('mcp__github__get_issue'))).toBe(true);
    expect(covers('allow', 'mcp__github__get_*', ...tool('mcp__github__create_issue'))).toBe(false);
  });

  test('mcp__* in a deny rule matches every MCP tool of every server and no built-in', () => {
    expect(covers('deny', 'mcp__*', ...tool('mcp__a__b'))).toBe(true);
    expect(covers('deny', 'mcp__*', ...tool('mcp__plugin_x_y__z'))).toBe(true);
    expect(covers('deny', 'mcp__*', ...tool('Read'))).toBe(false);
  });

  test('the rule wins by its place in deny, ask, allow order like any other', () => {
    const rules = [parsed('mcp__github', 'allow'), parsed('mcp__github__delete_repo', 'deny')];
    const verdict = (name: string) => evaluateRules(rules, call(name, {}), matchContext).behavior;
    expect(verdict('mcp__github__delete_repo')).toBe('deny');
    expect(verdict('mcp__github__get_issue')).toBe('allow');
  });
});

describe('writing the server name (permissions.md § MCP)', () => {
  test('characters such as . or spaces become _: my.server is mcp__my_server__*', () => {
    expect(normalizeMcpServerName('my.server')).toBe('my_server');
    expect(normalizeMcpServerName('my server')).toBe('my_server');
    expect(normalizeMcpServerName('a/b:c')).toBe('a_b_c');
    expect(normalizeMcpServerName('keeps-dash_and_UPPER9')).toBe('keeps-dash_and_UPPER9');
    expect(mcpToolName('my.server', 'run')).toBe('mcp__my_server__run');
    expect(covers('allow', 'mcp__my_server__*', ...tool(mcpToolName('my.server', 'run')))).toBe(
      true,
    );
  });

  test('a server from a plugin takes the plugin-scoped form (mcp.md)', () => {
    expect(pluginMcpServerName('my-plugin', 'database-tools')).toBe(
      'plugin_my-plugin_database-tools',
    );
    expect(mcpToolName(pluginMcpServerName('my-plugin', 'database-tools'), 'query')).toBe(
      'mcp__plugin_my-plugin_database-tools__query',
    );
    expect(pluginMcpServerName('my plugin', 'db.tools')).toBe('plugin_my_plugin_db_tools');
    const query = 'mcp__plugin_my-plugin_database-tools__query';
    expect(covers('allow', 'mcp__plugin_my-plugin_database-tools__*', ...tool(query))).toBe(true);
    expect(covers('deny', 'mcp__plugin_my-plugin_database-tools', ...tool(query))).toBe(true);
  });

  test('connector tools appear as mcp__claude_ai_<server>__<tool> and match like any other', () => {
    expect(
      covers('deny', 'mcp__claude_ai_Gmail__*', ...tool('mcp__claude_ai_Gmail__search_threads')),
    ).toBe(true);
  });
});

describe('a server whose name holds __ or ends in _ (permissions.md § MCP)', () => {
  const v2 = 'mcp__reports__v2__summary';
  const plain = 'mcp__reports__summary';

  test('the wildcard form with the whole name matches that server as allow, ask and deny', () => {
    for (const behavior of BEHAVIORS) {
      expect(covers(behavior, 'mcp__reports__v2__*', ...tool(v2))).toBe(true);
      expect(covers(behavior, 'mcp__reports__v2__*', ...tool(plain))).toBe(false);
    }
  });

  test('as allow rules the bare mcp__reports__v2 and the shorter mcp__reports do not match its tools', () => {
    expect(covers('allow', 'mcp__reports__v2', ...tool(v2))).toBe(false);
    expect(covers('allow', 'mcp__reports', ...tool(v2))).toBe(false);
  });

  test('the shorter rule still approves the tools of the server named reports', () => {
    expect(covers('allow', 'mcp__reports', ...tool(plain))).toBe(true);
  });

  test('as deny or ask rules each of those two names also covers every tool of reports__v2', () => {
    for (const behavior of ['deny', 'ask'] as const) {
      expect(covers(behavior, 'mcp__reports__v2', ...tool(v2))).toBe(true);
      expect(covers(behavior, 'mcp__reports', ...tool(v2))).toBe(true);
      expect(covers(behavior, 'mcp__reports', ...tool(plain))).toBe(true);
    }
  });

  test('to cover the server reports alone, one rule per tool in the mcp__reports__<tool> form', () => {
    for (const behavior of BEHAVIORS) {
      expect(covers(behavior, 'mcp__reports__summary', ...tool(plain))).toBe(true);
      expect(covers(behavior, 'mcp__reports__summary', ...tool(v2))).toBe(false);
    }
  });

  test('a server whose name ends in _ is written with the wildcard form', () => {
    const tools = mcpToolName('data_', 'query');
    expect(tools).toBe('mcp__data___query');
    expect(covers('allow', 'mcp__data___*', ...tool(tools))).toBe(true);
    expect(covers('allow', 'mcp__data_', ...tool(tools))).toBe(false);
    expect(covers('deny', 'mcp__data_', ...tool(tools))).toBe(true);
  });

  test('mcpToolRuleMatches answers the same per behaviour', () => {
    expect(mcpToolRuleMatches('mcp__reports', 'mcp__reports__v2__x', 'allow')).toBe(false);
    expect(mcpToolRuleMatches('mcp__reports', 'mcp__reports__v2__x', 'deny')).toBe(true);
    expect(mcpToolRuleMatches('mcp__reports', 'mcp__reports__v2__x', 'ask')).toBe(true);
    expect(mcpToolRuleMatches('Bash', 'Bash', 'allow')).toBe(true);
    expect(mcpToolRuleMatches('Bash', 'mcp__a__b', 'deny')).toBe(false);
  });
});

const write = (text: string, kind: 'project' | 'cli', behavior: 'deny' | 'allow' = 'deny') =>
  parseRule(text, { behavior, source: { kind } });

describe('an mcp__ rule with parentheses (permissions.md § Match by input parameter)', () => {
  test('a settings file skips it and reports it, as an issue and never a throw', () => {
    const { rule, issues } = write('mcp__github__create_issue(title:x)', 'project');
    expect(rule).toBe(undefined);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe('error');
    expect(issues[0]?.message).toContain('mcp__github__create_issue(title:x)');
    expect(issues[0]?.message).toContain('--disallowedTools');
  });

  test('the command line reads a deny rule as a parameter rule on the MCP tool', () => {
    const { rule, issues } = write('mcp__github__create_issue(title:Bug*)', 'cli');
    expect(issues).toEqual([]);
    expect(rule?.specifier).toEqual({ form: 'param', name: 'title', value: 'Bug*' });
    const verdict = (input: unknown) =>
      evaluateRules(
        rule === undefined ? [] : [rule],
        call('mcp__github__create_issue', input),
        matchContext,
      ).behavior;
    expect(verdict({ title: 'Bug in parser' })).toBe('deny');
    expect(verdict({ title: 'Feature' })).toBe(undefined);
  });
});

describe('the Cowork tools (permissions.md § MCP)', () => {
  test('a deny rule that names the whole Bash or WebFetch tool also blocks the Cowork tool', () => {
    expect(covers('deny', 'Bash', ...tool('mcp__workspace__bash'))).toBe(true);
    expect(covers('deny', 'WebFetch', ...tool('mcp__workspace__web_fetch'))).toBe(true);
  });

  test('allow rules do not carry over, and neither do rules with a specifier or another tool', () => {
    expect(covers('allow', 'Bash', ...tool('mcp__workspace__bash'))).toBe(false);
    expect(covers('allow', 'WebFetch', ...tool('mcp__workspace__web_fetch'))).toBe(false);
    expect(covers('deny', 'Bash(rm *)', 'mcp__workspace__bash', { command: 'rm -rf x' })).toBe(
      false,
    );
    expect(covers('deny', 'WebFetch', ...tool('mcp__workspace__bash'))).toBe(false);
    expect(covers('deny', 'Bash', ...tool('mcp__workspace__other'))).toBe(false);
  });
});
