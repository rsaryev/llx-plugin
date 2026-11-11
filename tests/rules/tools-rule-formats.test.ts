/**
 * tools-reference.md § Configure tools with permission rules and hooks, the "Rule format" table and
 * the sentence after it: "Tools not listed here, such as `ExitPlanMode` or `ShareOnboardingGuide`,
 * accept only the bare tool name with no specifier". Per tool the rule that its format admits is
 * written, parsed and evaluated with the kit's own matchers; the format per tool is the hand-copied
 * "Applies to" column in `tests/support/tool-table.ts`. A bare rule never has a specifier, so the
 * other formats are told apart by what a rule of that format covers.
 */
import { describe, expect, test } from 'bun:test';
import { evaluateRules } from '../../src/rules/index.ts';
import { ruleFormatOf } from '../../src/rules/specifier-formats.ts';
import { call, matchContext, parsed } from '../support/rule-context.ts';
import { spec } from '../support/spec.ts';
import { TOOL_TABLE, type ToolRow } from '../support/tool-table.ts';

const verdict = (text: string, behavior: 'deny' | 'allow', toolName: string, input: unknown) =>
  evaluateRules([parsed(text, behavior)], call(toolName, input), matchContext).behavior;

/** Each non-bare format: the rule of that format and a call it covers and one it does not, written as the docs' examples. */
type Probe = (row: ToolRow) => void;

const commandProbe: Probe = ({ tool }) => {
  test(`${tool}(npm run *) covers a command that starts so, and ${tool}(*) is the bare name`, () => {
    expect(verdict(`${tool}(npm run *)`, 'deny', tool, { command: 'npm run build' })).toBe('deny');
    expect(verdict(`${tool}(npm run *)`, 'deny', tool, { command: 'ls' })).toBeUndefined();
    expect(parsed(`${tool}(*)`, 'deny').specifier).toBeUndefined();
  });
};

const powershellProbe: Probe = ({ tool }) => {
  test(`${tool}(Get-ChildItem *) allows that cmdlet and not another`, () => {
    expect(verdict(`${tool}(Get-ChildItem *)`, 'allow', tool, { command: 'Get-ChildItem .' })).toBe(
      'allow',
    );
    expect(
      verdict(`${tool}(Get-ChildItem *)`, 'allow', tool, { command: 'Remove-Item x' }),
    ).toBeUndefined();
  });
};

const atPath = (path: string) => ({
  pattern: '*',
  file_path: path,
  path,
  notebook_path: path,
  content: '',
});

const readPathProbe: Probe = ({ tool }) => {
  test(`a Read(...) deny rule covers a ${tool} call on that path, and an Edit(...) one does not`, () => {
    const onEnv = atPath('/work/app/.env');
    const onTs = atPath('/work/app/a.ts');
    expect(verdict('Read(./.env)', 'deny', tool, onEnv)).toBe('deny');
    expect(verdict('Edit(./.env)', 'deny', tool, onEnv)).toBeUndefined();
    // LSP names no path field in the docs, so a Read rule covers every call of it (spec/judgments.md).
    expect(verdict('Read(./.env)', 'deny', tool, onTs)).toBe(tool === 'LSP' ? 'deny' : undefined);
  });
};

const editPathProbe: Probe = ({ tool }) => {
  test(`an Edit(...) deny rule covers a ${tool} call on that path and no other`, () => {
    expect(verdict('Edit(src/**)', 'deny', tool, atPath('/work/app/src/a.ts'))).toBe('deny');
    expect(verdict('Edit(src/**)', 'deny', tool, atPath('/work/app/docs/a.md'))).toBeUndefined();
  });
};

const skillProbe: Probe = ({ tool }) => {
  test(`${tool}(deploy *) covers the skill deploy and not another`, () => {
    expect(verdict('Skill(deploy *)', 'deny', tool, { skill: 'deploy' })).toBe('deny');
    expect(verdict('Skill(deploy *)', 'deny', tool, { skill: 'review' })).toBeUndefined();
  });
};

const subagentProbe: Probe = ({ tool }) => {
  test(`${tool}(Explore) covers that subagent type and not Plan`, () => {
    expect(verdict('Agent(Explore)', 'deny', tool, { subagent_type: 'Explore' })).toBe('deny');
    expect(verdict('Agent(Explore)', 'deny', tool, { subagent_type: 'Plan' })).toBeUndefined();
  });
};

const domainProbe: Probe = ({ tool }) => {
  test(`${tool}(domain:example.com) covers that host and not another`, () => {
    const rule = 'WebFetch(domain:example.com)';
    expect(parsed(rule, 'deny').specifier).toEqual({ form: 'domain', pattern: 'example.com' });
    expect(verdict(rule, 'deny', tool, { url: 'https://example.com/docs' })).toBe('deny');
    expect(verdict(rule, 'deny', tool, { url: 'https://example.org/docs' })).toBeUndefined();
  });
};

const bareProbe: Probe = ({ tool, input }) => {
  test(`${tool} takes only its bare name: the bare rule covers every call, a specifier approves nothing`, () => {
    expect(verdict(tool, 'deny', tool, input)).toBe('deny');
    expect(verdict(tool, 'allow', tool, input)).toBe('allow');
    expect(verdict(`${tool}(anything)`, 'allow', tool, input)).toBeUndefined();
  });
};

const PROBES: { readonly [F in ToolRow['format']]: Probe } = {
  command: commandProbe,
  'powershell-command': powershellProbe,
  'read-path': readPathProbe,
  'edit-path': editPathProbe,
  'skill-name': skillProbe,
  'subagent-type': subagentProbe,
  domain: domainProbe,
  bare: bareProbe,
};

const CONFIGURE = 'tools.behavior.Configure tools with permission rules and hooks';
/** The docs' example rule of each format, one id each. */
const EXAMPLE: Readonly<Record<string, string>> = {
  Bash: 'Bash(npm run *)',
  PowerShell: 'PowerShell(Get-ChildItem *)',
  Read: 'Read(~/secrets/**)',
  Edit: 'Edit(/src/**)',
  Skill: 'Skill(deploy *)',
  Agent: 'Agent(Explore)',
  WebFetch: 'WebFetch(domain:example.com)',
  WebSearch: 'WebSearch',
};

for (const row of TOOL_TABLE) {
  const example = EXAMPLE[row.tool];
  const ids = [
    `tools.tool.${row.tool}`,
    ...(example === undefined ? [] : [`${CONFIGURE}.${example}`]),
  ];
  spec(ids, () => {
    PROBES[row.format](row);
  });
}

describe('the format the kit reads a tool with is the documented one', () => {
  test('ruleFormatOf answers the "Applies to" column for every tool of the table', () => {
    for (const { tool, format } of TOOL_TABLE) expect(ruleFormatOf(tool)).toBe(format);
  });

  test('a tool the table does not list takes only the bare name; the legacy MultiEdit reads like Edit', () => {
    expect(ruleFormatOf('mcp__github__get_issue')).toBe('bare');
    expect(ruleFormatOf('NoSuchTool')).toBe('bare');
    expect(ruleFormatOf('MultiEdit')).toBe('edit-path');
  });
});

spec(CONFIGURE, () => {
  test('every example rule of the table parses with the tool it names', () => {
    for (const rule of Object.values(EXAMPLE)) {
      expect(parsed(rule, 'allow').value.toolName).toBe(rule.split('(')[0] ?? '');
    }
  });
});
