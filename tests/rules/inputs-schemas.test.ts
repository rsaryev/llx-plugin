/**
 * hooks.md § PreToolUse input (the `tool_input` table of each tool: Bash, PowerShell, Write, Edit,
 * Read, Glob, Grep, WebFetch, WebSearch, Agent). The table gives each field a type and marks the
 * optional ones. The kit's behaviour here is the typed contract: a hook's `tool_input` is read
 * against its tool's table, a wrong type or a missing required field is a PluginIssue at
 * `tool_input.<field>`, a field the table does not list (the SDK's input types carry more) passes
 * through. A pure data field has no other behaviour to prove; its role in rules sits in
 * inputs-roles.test.ts. Optionality where the table is silent is a judgment (spec/judgments.md),
 * tested outside spec().
 *
 * WebSearch `mode` (hooks.md § WebSearch) and ExitPlanMode `plan` and `planFilePath` are in the docs
 * and not in the SDK's input types: they are doc-sourced, not SDK-sourced.
 */
import { describe, expect, test } from 'bun:test';
import { INPUT_TABLE, validInput, WRONG_VALUE, type InputRow } from '../support/tool-inputs.ts';
import { spec } from '../support/spec.ts';
import { effectiveSearchMode, parseToolInput } from '../../src/rules/index.ts';
import { call, matchContext, parsed } from '../support/rule-context.ts';
import { matchRule } from '../../src/rules/index.ts';

/** The ids this sub-package proves; the other fields of the tables belong to tool-semantics. */
const OWNED: ReadonlySet<string> = new Set([
  'tools.input.Agent.prompt',
  'tools.input.Agent.description',
  'tools.input.Agent.subagent_type',
  'tools.input.Agent.model',
  'tools.input.Bash.command',
  'tools.input.Bash.description',
  'tools.input.Bash.run_in_background',
  'tools.input.Edit.file_path',
  'tools.input.Glob.path',
  'tools.input.Glob.pattern',
  'tools.input.Grep.-i',
  'tools.input.Grep.glob',
  'tools.input.Grep.multiline',
  'tools.input.Grep.path',
  'tools.input.Grep.pattern',
  'tools.input.PowerShell.command',
  'tools.input.PowerShell.description',
  'tools.input.PowerShell.run_in_background',
  'tools.input.PowerShell.timeout',
  'tools.input.Read.file_path',
  'tools.input.WebFetch.prompt',
  'tools.input.WebSearch.query',
  'tools.input.Write.content',
  'tools.input.Write.file_path',
]);

const without = (input: Record<string, unknown>, field: string): Record<string, unknown> =>
  Object.fromEntries(Object.entries(input).filter(([name]) => name !== field));

function contractOf(entry: InputRow): void {
  const { tool, field, type, optional, example } = entry;
  const base = without(validInput(tool), field);

  test(`${tool}.${field} accepts the table's example`, () => {
    const parse = parseToolInput(tool, { ...base, [field]: example });
    expect(parse.issues).toEqual([]);
    expect(parse.input[field]).toEqual(example);
  });

  test(`${tool}.${field} must be ${type === 'array' ? 'an array' : `a ${type}`}`, () => {
    const parse = parseToolInput(tool, { ...base, [field]: WRONG_VALUE[type] });
    expect(parse.issues.map(({ severity, path }) => [severity, path])).toEqual([
      ['error', `tool_input.${field}`],
    ]);
  });

  test(`${tool}.${field} is ${optional ? 'optional' : 'required'}`, () => {
    const parse = parseToolInput(tool, base);
    expect(parse.issues.map(({ path, message }) => [path, message])).toEqual(
      optional ? [] : [[`tool_input.${field}`, 'is required']],
    );
  });
}

for (const entry of INPUT_TABLE) {
  const id = `tools.input.${entry.tool}.${entry.field}`;
  const body = (): void => contractOf(entry);
  if (OWNED.has(id)) spec(id, body);
  else describe(`${id} (typed contract)`, body);
}

spec('tools.input.WebSearch.mode', () => {
  // hooks.md § WebSearch: "standard" requests a lighter search and "extended" the full search; some
  // sessions do not send it, and a call without it runs the full search.
  test('"standard" and "extended" are the two search types', () => {
    for (const mode of ['standard', 'extended']) {
      expect(parseToolInput('WebSearch', { query: 'q', mode }).issues).toEqual([]);
    }
  });

  test('another mode is refused at tool_input.mode', () => {
    const { issues } = parseToolInput('WebSearch', { query: 'q', mode: 'deep' });
    expect(issues.map((found) => found.path)).toEqual(['tool_input.mode']);
  });

  test('a call without mode runs the full search', () => {
    expect(effectiveSearchMode({ query: 'q' })).toBe('extended');
    expect(effectiveSearchMode({ query: 'q', mode: 'standard' })).toBe('standard');
    expect(effectiveSearchMode({ query: 'q', mode: 'extended' })).toBe('extended');
  });

  test('a rule can match it like any scalar parameter', () => {
    const rule = parsed('WebSearch(mode:standard)');
    expect(matchRule(rule, call('WebSearch', { query: 'q', mode: 'standard' }), matchContext)).toBe(
      true,
    );
    expect(matchRule(rule, call('WebSearch', { query: 'q' }), matchContext)).toBe(false);
  });
});

describe('the rest of a tool_input (judgments, spec/judgments.md)', () => {
  test('a field the table does not list passes through without an issue', () => {
    // The SDK's input types carry more fields than hooks.md lists (Bash dangerouslyDisableSandbox).
    const raw = { command: 'ls', dangerouslyDisableSandbox: true, extra: { nested: 1 } };
    const parse = parseToolInput('Bash', raw);
    expect(parse.issues).toEqual([]);
    expect(parse.input).toEqual(raw);
  });

  test('a tool the tables do not describe passes through without an issue', () => {
    for (const tool of ['Skill', 'mcp__github__create_issue', 'NotebookEdit']) {
      const parse = parseToolInput(tool, { anything: [1, 2] });
      expect(parse.issues).toEqual([]);
      expect(parse.input).toEqual({ anything: [1, 2] });
    }
  });

  test('an input that is not an object is one issue at tool_input', () => {
    for (const raw of [undefined, null, 'ls', ['ls'], 4]) {
      const parse = parseToolInput('Bash', raw);
      expect(parse.issues.map(({ severity, path }) => [severity, path])).toEqual([
        ['error', 'tool_input'],
      ]);
      expect(parse.input).toEqual({});
    }
  });

  test('every problem is reported, one issue each', () => {
    const { issues } = parseToolInput('Edit', { file_path: 1, old_string: 'a', replace_all: 'x' });
    expect(issues.map((found) => found.path).toSorted()).toEqual([
      'tool_input.file_path',
      'tool_input.new_string',
      'tool_input.replace_all',
    ]);
  });

  test('the output_mode of Grep is one of the three the table lists', () => {
    for (const output_mode of ['content', 'files_with_matches', 'count']) {
      expect(parseToolInput('Grep', { pattern: 'a', output_mode }).issues).toEqual([]);
    }
    const { issues } = parseToolInput('Grep', { pattern: 'a', output_mode: 'lines' });
    expect(issues.map((found) => found.path)).toEqual(['tool_input.output_mode']);
  });

  test('a timeout above the maximum is not refused: it is reduced, not rejected (hooks.md § Bash)', () => {
    expect(parseToolInput('Bash', { command: 'ls', timeout: 99_999_999 }).issues).toEqual([]);
  });

  test('the parsed input is a copy: changing it leaves the raw input alone', () => {
    const raw = { command: 'ls' };
    const parse = parseToolInput('Bash', raw);
    Object.assign(parse.input, { command: 'rm' });
    expect(raw.command).toBe('ls');
  });
});
