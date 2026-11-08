/**
 * permissions.md § Match by input parameter, hooks.md § Common fields (`if`) and § PreToolUse input.
 * What a field is for decides what a rule can do with it: a scalar parameter is matched by a deny
 * or ask `Tool(param:value)` rule ("This works for any scalar parameter the tool accepts"); the
 * primary content field of a tool ("`command` for Bash and PowerShell, `file_path` for Read, Edit,
 * and Write, `path` for Grep and Glob ... and `url` for WebFetch") cannot be matched this way, "Claude
 * Code ignores it and emits a startup warning"; a field nested in an object or array is not
 * matchable. The same rule text is a hook's `if`, so evaluateIf follows it.
 *
 * Each case builds the rule text from the docs' lists below and asks matchRule, parseRule and
 * evaluateIf; the kit's registry is checked against that behaviour, never read back.
 */
import { describe, expect, test } from 'bun:test';
import { evaluateIf, matchRule, parseRule, TOOL_INPUT_FIELDS } from '../../src/rules/index.ts';
import { call, matchContext } from '../support/rule-context.ts';
import { spec } from '../support/spec.ts';
import { INPUT_TABLE, validInput, type InputRow } from '../support/tool-inputs.ts';

/** permissions.md's list of primary content fields, as tool to field. */
const PRIMARY: ReadonlyMap<string, string> = new Map([
  ['Bash', 'command'],
  ['PowerShell', 'command'],
  ['Read', 'file_path'],
  ['Edit', 'file_path'],
  ['Write', 'file_path'],
  ['Grep', 'path'],
  ['Glob', 'path'],
  ['WebFetch', 'url'],
]);

const isPrimary = ({ tool, field }: InputRow): boolean => PRIMARY.get(tool) === field;
const isStructured = ({ type }: InputRow): boolean => type === 'array' || type === 'object';

const ruleText = ({ tool, field, example }: InputRow): string =>
  `${tool}(${field}:${String(example)})`;
const input = (entry: InputRow, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  ...validInput(entry.tool),
  [entry.field]: entry.example,
  ...extra,
});

const read = (text: string, behavior: 'deny' | 'ask' | 'allow' = 'deny') =>
  parseRule(text, { behavior, source: { kind: 'user' } });
const matches = (text: string, tool: string, value: unknown, behavior: 'deny' | 'ask' = 'deny') => {
  const { rule } = read(text, behavior);
  return rule !== undefined && matchRule(rule, call(tool, value), matchContext);
};

/** The registry's entry for a documented field. */
const REGISTRY = new Map(Object.entries(TOOL_INPUT_FIELDS));
const registered = ({ tool, field }: InputRow) => {
  const fields = REGISTRY.get(tool);
  return fields !== undefined && Object.hasOwn(fields, field) ? fields[field] : undefined;
};

const OWNED_FIELDS: ReadonlySet<string> = new Set([
  'Agent.prompt',
  'Agent.description',
  'Agent.subagent_type',
  'Agent.model',
  'AskUserQuestion.questions',
  'AskUserQuestion.answers',
  'Bash.command',
  'Bash.description',
  'Bash.run_in_background',
  'Edit.file_path',
  'ExitPlanMode.allowedPrompts',
  'ExitPlanMode.plan',
  'ExitPlanMode.planFilePath',
  'Glob.path',
  'Glob.pattern',
  'Grep.-i',
  'Grep.glob',
  'Grep.multiline',
  'Grep.path',
  'Grep.pattern',
  'PowerShell.command',
  'PowerShell.description',
  'PowerShell.run_in_background',
  'PowerShell.timeout',
  'Read.file_path',
  'WebFetch.prompt',
  'WebSearch.query',
  'WebSearch.mode',
  'Write.content',
  'Write.file_path',
]);

function scalarBehaviour(entry: InputRow): void {
  const text = ruleText(entry);
  test(`${text} matches a call that sets the field to that value`, () => {
    for (const behavior of ['deny', 'ask'] as const) {
      expect([behavior, matches(text, entry.tool, input(entry), behavior)]).toEqual([
        behavior,
        true,
      ]);
    }
  });
  test(`${text} never matches a call that omits the field`, () => {
    const withoutField = Object.fromEntries(
      Object.entries(input(entry)).filter(([name]) => name !== entry.field),
    );
    expect(matches(text, entry.tool, withoutField)).toBe(false);
  });
  test(`${text} is a deny and ask rule only: an allow rule keeps the tool's own syntax`, () => {
    const { rule } = read(text, 'allow');
    expect(rule?.specifier?.form).toBe('text');
  });
  test(`the same text as a hook if runs the handler only for a matching call`, () => {
    expect(evaluateIf(text, entry.tool, input(entry), matchContext)).toEqual({
      runs: true,
      issues: [],
    });
    const others = Object.fromEntries(
      Object.entries(input(entry)).filter(([name]) => name !== entry.field),
    );
    expect(evaluateIf(text, entry.tool, others, matchContext).runs).toBe(false);
  });
}

function primaryBehaviour(entry: InputRow): void {
  const text = ruleText(entry);
  test(`${text} is ignored with a startup warning`, () => {
    const { rule, issues } = read(text);
    expect(rule).toBeUndefined();
    expect(issues.map((found) => found.severity)).toEqual(['warning']);
    expect(issues[0]?.message).toContain('primary content field');
  });
  test(`${text} as a hook if runs the handler and reports why`, () => {
    const result = evaluateIf(text, entry.tool, input(entry), matchContext);
    expect(result.runs).toBe(true);
    expect(result.issues.map((found) => [found.severity, found.path])).toEqual([
      ['warning', 'hooks.if'],
    ]);
  });
}

function structuredBehaviour(entry: InputRow): void {
  test(`${entry.tool}(${entry.field}:*) never matches: the field holds ${entry.type === 'array' ? 'an array' : 'an object'}`, () => {
    expect(matches(`${entry.tool}(${entry.field}:*)`, entry.tool, input(entry))).toBe(false);
    expect(
      evaluateIf(`${entry.tool}(${entry.field}:*)`, entry.tool, input(entry), matchContext).runs,
    ).toBe(false);
  });
}

const behaviourOf = (entry: InputRow): (() => void) => {
  if (isPrimary(entry)) return () => primaryBehaviour(entry);
  if (isStructured(entry)) return () => structuredBehaviour(entry);
  return () => scalarBehaviour(entry);
};

for (const entry of INPUT_TABLE) {
  const body = behaviourOf(entry);
  const owned = OWNED_FIELDS.has(`${entry.tool}.${entry.field}`);
  if (owned) spec(`tools.input.${entry.tool}.${entry.field}`, body);
  else describe(`${entry.tool}.${entry.field} in a rule`, body);
}

describe('the registry agrees with the docs (a role is what a rule does with the field)', () => {
  test('every documented field is in the registry with its documented type and optionality', () => {
    for (const entry of INPUT_TABLE) {
      const found = registered(entry);
      expect([entry.tool, entry.field, found?.type, found?.optional]).toEqual([
        entry.tool,
        entry.field,
        entry.type,
        entry.optional,
      ]);
    }
  });

  test('exactly the primary fields of permissions.md have the primary role', () => {
    for (const entry of INPUT_TABLE) {
      const role = registered(entry)?.role;
      expect([entry.tool, entry.field, role === 'primary']).toEqual([
        entry.tool,
        entry.field,
        isPrimary(entry),
      ]);
    }
  });

  test('exactly the array and object fields have the structured role', () => {
    for (const entry of INPUT_TABLE) {
      const role = registered(entry)?.role;
      expect([entry.tool, entry.field, role === 'structured']).toEqual([
        entry.tool,
        entry.field,
        isStructured(entry),
      ]);
    }
  });

  test('the Agent subagent_type is the subject of its tool: Agent(Explore) and the parameter form agree', () => {
    const explore = { prompt: 'p', description: 'd', subagent_type: 'Explore' };
    expect(TOOL_INPUT_FIELDS.Agent.subagent_type?.role).toBe('subject');
    expect(matches('Agent(Explore)', 'Agent', explore)).toBe(true);
    expect(matches('Agent(subagent_type:Explore)', 'Agent', explore)).toBe(true);
  });

  test('the fields the docs add to the SDK are marked as documented only', () => {
    const docsOnly = Object.entries(TOOL_INPUT_FIELDS).flatMap(([tool, fields]) =>
      Object.entries(fields)
        .filter(([, spec_]) => spec_.source === 'docs')
        .map(([field]) => `${tool}.${field}`),
    );
    expect(docsOnly.toSorted()).toEqual([
      'ExitPlanMode.plan',
      'ExitPlanMode.planFilePath',
      'WebSearch.mode',
    ]);
  });
});
