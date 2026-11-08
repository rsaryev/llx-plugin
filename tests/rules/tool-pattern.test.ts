/**
 * permissions.md § Tool name wildcards: deny and ask rules accept globs in the tool-name position
 * and "the pattern must match the full tool name"; allow rules accept them "only after a literal
 * `mcp__<server>__` prefix" and an unanchored allow glob "is skipped and doesn't auto-approve
 * anything". No requirement id covers this section, so none of it is under spec(); it is the
 * documented behaviour `Bash`, `Read` and `WebFetch` rules and the MCP rules are built on.
 */
import { describe, expect, test } from 'bun:test';
import { PERMISSION_BEHAVIORS } from '../../src/protocol/permission-modes.ts';
import { matchRule, parseRule } from '../../src/rules/index.ts';
import { call, matchContext, parsed } from '../support/rule-context.ts';

const covers = (pattern: string, toolName: string, behavior: 'deny' | 'ask' = 'deny') =>
  matchRule(parsed(pattern, behavior), call(toolName, {}), matchContext);

describe('a glob in the tool-name position of a deny or ask rule', () => {
  test('"*" matches every tool', () => {
    for (const tool of ['Bash', 'Read', 'mcp__github__get_issue', 'Stop Task']) {
      expect(covers('*', tool)).toBe(true);
      expect(covers('*', tool, 'ask')).toBe(true);
    }
  });

  test('"mcp__*" matches every MCP tool across all servers, and nothing else', () => {
    expect(covers('mcp__*', 'mcp__puppeteer__puppeteer_navigate')).toBe(true);
    expect(covers('mcp__*', 'mcp__github__get_issue')).toBe(true);
    expect(covers('mcp__*', 'Bash')).toBe(false);
    expect(covers('mcp__*', 'xmcp__a__b')).toBe(false);
  });

  test('the pattern must match the full tool name', () => {
    expect(covers('Ba*', 'Bash')).toBe(true);
    expect(covers('*ash', 'Bash')).toBe(true);
    expect(covers('B*h', 'Bash')).toBe(true);
    expect(covers('Ba*', 'XBash')).toBe(false);
    expect(covers('*as', 'Bash')).toBe(false);
    expect(covers('Bash*', 'Bash')).toBe(true);
    expect(covers('Bash*', 'BashOutput')).toBe(true);
  });

  test('matching is case-sensitive, like tool names', () => {
    expect(covers('ba*', 'Bash')).toBe(false);
  });

  test('a character that is special in a regular expression is literal', () => {
    expect(covers('mcp__my.server__*', 'mcp__my.server__x')).toBe(true);
    expect(covers('mcp__my.server__*', 'mcp__myXserver__x')).toBe(false);
    expect(covers('a+b*', 'aab')).toBe(false);
    expect(covers('a+b*', 'a+b')).toBe(true);
  });

  test('is a whole-tool rule: no specifier', () => {
    expect(parsed('mcp__*').specifier).toBeUndefined();
  });
});

describe('a glob in the tool-name position of an allow rule', () => {
  const skipped = ['*', 'B*', 'mcp__*', 'mcp__*__get_issue', 'mcp__git*__x', 'mcp__github*'];

  test('unanchored globs are skipped and approve nothing', () => {
    for (const text of skipped) {
      const { rule, issues } = parseRule(text, { behavior: 'allow', source: { kind: 'project' } });
      expect([text, rule]).toEqual([text, undefined]);
      expect(issues.map((found) => found.severity)).toEqual(['warning']);
      expect(issues[0]?.message).toContain(`"${text}"`);
    }
  });

  test('the same globs are accepted as deny and ask rules', () => {
    for (const text of skipped) {
      for (const behavior of ['deny', 'ask'] as const) {
        expect(parseRule(text, { behavior, source: { kind: 'project' } }).rule).toBeDefined();
      }
    }
  });

  test('mcp__<server>__ followed by a glob names one server and is accepted', () => {
    for (const text of ['mcp__puppeteer__*', 'mcp__github__get_*', 'mcp__reports__v2__*']) {
      expect(parsed(text, 'allow').toolGlob).toBe(true);
    }
  });

  test('an anchored allow glob matches that server tools only', () => {
    expect(covers('mcp__puppeteer__*', 'mcp__puppeteer__puppeteer_navigate')).toBe(true);
    expect(covers('mcp__puppeteer__*', 'mcp__github__get_issue')).toBe(false);
    const allow = parsed('mcp__github__get_*', 'allow');
    const get = call('mcp__github__get_issue', {});
    const create = call('mcp__github__create_issue', {});
    expect(matchRule(allow, get, matchContext)).toBe(true);
    expect(matchRule(allow, create, matchContext)).toBe(false);
  });

  test('a literal tool name is not a glob, so it needs no anchor', () => {
    for (const behavior of PERMISSION_BEHAVIORS) {
      expect(parsed('Bash', behavior).toolGlob).toBe(false);
      expect(parsed('mcp__puppeteer__puppeteer_navigate', behavior).toolGlob).toBe(false);
    }
  });
});
