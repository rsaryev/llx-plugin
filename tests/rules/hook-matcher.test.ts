/**
 * hooks.md § Matcher patterns and § Match MCP tools: how a `matcher` string is evaluated against
 * the field an event filters on. This file proves the grammar only (match-all, exact names and
 * lists, regular expressions, the narrower set of FileChanged and StopFailure, MCP tool names).
 * Which field an event filters on, and that the nine events without matcher support ignore a
 * matcher, belong to event selection (hooks/select) and are proven there under the per-event
 * `hooks.matcher.<Event>` ids; none of those ids is claimed here, because a string-against-string
 * test cannot show which field the kit passes in.
 */
import { describe, expect, test } from 'bun:test';
import { matchesMatcher } from '../../src/rules/index.ts';

describe('match all: "*", "" or omitted', () => {
  test('fire on every occurrence, whatever the value', () => {
    for (const matcher of ['*', '', undefined]) {
      expect(matchesMatcher(matcher, 'Bash')).toBe(true);
      expect(matchesMatcher(matcher, 'mcp__memory__create_entities')).toBe(true);
    }
  });

  test('also when the event has no value to filter on', () => {
    for (const matcher of ['*', '', undefined])
      expect(matchesMatcher(matcher, undefined)).toBe(true);
  });
});

describe('exact string or list (letters, digits, "_", "-", spaces, "," and "|")', () => {
  test('`Bash` matches the Bash tool and nothing that only contains the name', () => {
    expect(matchesMatcher('Bash', 'Bash')).toBe(true);
    expect(matchesMatcher('Bash', 'BashOutput')).toBe(false);
    expect(matchesMatcher('Bash', 'MyBash')).toBe(false);
  });

  test('is case sensitive', () => {
    expect(matchesMatcher('Bash', 'bash')).toBe(false);
  });

  test('`Edit|Write` and `Edit, Write` each match either tool exactly', () => {
    for (const matcher of ['Edit|Write', 'Edit, Write', 'Edit,Write', ' Edit | Write ']) {
      expect(matchesMatcher(matcher, 'Edit')).toBe(true);
      expect(matchesMatcher(matcher, 'Write')).toBe(true);
      expect(matchesMatcher(matcher, 'NotebookEdit')).toBe(false);
      expect(matchesMatcher(matcher, 'Read')).toBe(false);
    }
  });

  test('`code-reviewer` matches only that agent type', () => {
    expect(matchesMatcher('code-reviewer', 'code-reviewer')).toBe(true);
    expect(matchesMatcher('code-reviewer', 'my-code-reviewer')).toBe(false);
    expect(matchesMatcher('code-reviewer', 'code-reviewer-2')).toBe(false);
  });

  test('a list of event values: `startup|resume`, `manual, auto`', () => {
    expect(matchesMatcher('startup|resume', 'resume')).toBe(true);
    expect(matchesMatcher('startup|resume', 'clear')).toBe(false);
    expect(matchesMatcher('manual, auto', 'auto')).toBe(true);
    expect(matchesMatcher('manual, auto', 'other')).toBe(false);
  });

  test('a model list is exact: `claude-opus-4-6|claude-opus-5`', () => {
    expect(matchesMatcher('claude-opus-4-6|claude-opus-5', 'claude-opus-5')).toBe(true);
    expect(matchesMatcher('claude-opus-4-6|claude-opus-5', 'claude-opus-4-6')).toBe(true);
    expect(matchesMatcher('claude-opus-4-6|claude-opus-5', 'claude-opus-5-1')).toBe(false);
  });
});

describe('regular expression (any other character), unanchored', () => {
  test('`^Notebook` matches any tool whose name starts with Notebook', () => {
    expect(matchesMatcher('^Notebook', 'NotebookEdit')).toBe(true);
    expect(matchesMatcher('^Notebook', 'EditNotebook')).toBe(false);
  });

  test('`Edit.*` matches both `Edit` and `NotebookEdit`: it succeeds on a match anywhere', () => {
    expect(matchesMatcher('Edit.*', 'Edit')).toBe(true);
    expect(matchesMatcher('Edit.*', 'NotebookEdit')).toBe(true);
  });

  test('`^Edit$` is a whole-string match', () => {
    expect(matchesMatcher('^Edit$', 'Edit')).toBe(true);
    expect(matchesMatcher('^Edit$', 'NotebookEdit')).toBe(false);
  });

  test('`.*opus.*` matches a model name that contains opus', () => {
    expect(matchesMatcher('.*opus.*', 'claude-opus-5')).toBe(true);
    expect(matchesMatcher('.*opus.*', 'claude-sonnet-5')).toBe(false);
  });

  test('a plugin-scoped agent name: `^my-plugin:reviewer$`', () => {
    expect(matchesMatcher('^my-plugin:reviewer$', 'my-plugin:reviewer')).toBe(true);
    expect(matchesMatcher('^my-plugin:reviewer$', 'other:my-plugin:reviewer')).toBe(false);
  });

  test('`Bash|PowerShell` stays an exact list, `Bash.*` is a pattern', () => {
    expect(matchesMatcher('Bash|PowerShell', 'PowerShell')).toBe(true);
    expect(matchesMatcher('Bash.*', 'BashOutput')).toBe(true);
    expect(matchesMatcher('Bash|PowerShell', 'BashOutput')).toBe(false);
  });
});

describe('MCP tools (mcp__<server>__<tool>)', () => {
  test('`mcp__memory__.*` matches every tool of the memory server and no other', () => {
    expect(matchesMatcher('mcp__memory__.*', 'mcp__memory__create_entities')).toBe(true);
    expect(matchesMatcher('mcp__memory__.*', 'mcp__filesystem__read_file')).toBe(false);
  });

  test('`.*` is required: `mcp__memory` is an exact string and matches no tool', () => {
    expect(matchesMatcher('mcp__memory', 'mcp__memory__create_entities')).toBe(false);
    expect(matchesMatcher('mcp__brave-search', 'mcp__brave-search__web_search')).toBe(false);
  });

  test('a server name with a hyphen: `mcp__brave-search__.*`', () => {
    expect(matchesMatcher('mcp__brave-search__.*', 'mcp__brave-search__web_search')).toBe(true);
  });

  test('`mcp__.*__write.*` matches a tool starting with write on any server', () => {
    expect(matchesMatcher('mcp__.*__write.*', 'mcp__github__write_file')).toBe(true);
    expect(matchesMatcher('mcp__.*__write.*', 'mcp__fs__write')).toBe(true);
    expect(matchesMatcher('mcp__.*__write.*', 'mcp__fs__read_file')).toBe(false);
  });

  test('a plugin-bundled server uses the scoped segment; the bare server key never fires', () => {
    const tool = 'mcp__plugin_my-plugin_db__query';
    expect(matchesMatcher('mcp__plugin_my-plugin_db__.*', tool)).toBe(true);
    expect(matchesMatcher('mcp__db__.*', tool)).toBe(false);
  });
});

describe('the narrower set of FileChanged and StopFailure: letters, digits, "_" and "|"', () => {
  test('only "|" separates alternatives', () => {
    expect(matchesMatcher('rate_limit|overloaded', 'overloaded', 'narrow')).toBe(true);
    expect(matchesMatcher('rate_limit|overloaded', 'server_error', 'narrow')).toBe(false);
  });

  test('a comma, a space or a hyphen keeps the matcher on the regular-expression path', () => {
    // Unanchored, so `a,b` as a pattern matches only a value that contains the literal "a,b".
    expect(matchesMatcher('a,b', 'a', 'narrow')).toBe(false);
    expect(matchesMatcher('a,b', 'a,b', 'narrow')).toBe(true);
    expect(matchesMatcher('a,b', 'x a,b y', 'narrow')).toBe(true);
    // The same text in the standard set is a list of two names.
    expect(matchesMatcher('a,b', 'a')).toBe(true);
    expect(matchesMatcher('my-file', 'my-file.txt', 'narrow')).toBe(true);
    expect(matchesMatcher('my-file', 'my-file.txt')).toBe(false);
  });

  test('`.envrc|.env` holds a ".", so it is a pattern tested against the basename', () => {
    expect(matchesMatcher('.envrc|.env', '.envrc', 'narrow')).toBe(true);
    expect(matchesMatcher('.envrc|.env', '.env', 'narrow')).toBe(true);
    expect(matchesMatcher('.envrc|.env', 'package.json', 'narrow')).toBe(false);
    // Only an unanchored regular expression selects this; an exact list would not.
    expect(matchesMatcher('.envrc|.env', 'xenv', 'narrow')).toBe(true);
  });

  test('match-all spellings are the same as in the standard set', () => {
    expect(matchesMatcher('*', 'data.csv', 'narrow')).toBe(true);
    expect(matchesMatcher(undefined, 'data.csv', 'narrow')).toBe(true);
  });
});

// The docs are silent on what follows; each is a row in spec/judgments.md.
describe('judgments where the docs are silent', () => {
  test('a value that is not there matches only match-all', () => {
    expect(matchesMatcher('Bash', undefined)).toBe(false);
    expect(matchesMatcher('^B', undefined)).toBe(false);
  });

  test('an invalid regular expression matches nothing instead of throwing', () => {
    expect(matchesMatcher('Edit(', 'Edit(')).toBe(false);
    expect(matchesMatcher('[', '[')).toBe(false);
  });

  test('empty alternatives in a list match nothing', () => {
    expect(matchesMatcher('Edit|', '')).toBe(false);
    expect(matchesMatcher('Edit|', 'Edit')).toBe(true);
    expect(matchesMatcher(' ', '')).toBe(false);
  });
});
