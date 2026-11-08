/**
 * tools-reference.md § Tools reference (the tools table) and permissions.md § Tool name wildcards
 * ("A deny or ask rule whose tool name matches no known tool produces a startup warning to catch
 * typos"). Every tool of the table is a name a rule may use without a warning; anything else is a
 * typo, a label such as `Stop Task`, or an MCP tool. The names come from the hand-copied table in
 * `tests/support/tool-table.ts`.
 */
import { describe, expect, test } from 'bun:test';
import { DOCUMENTED_TOOLS, REMOVED_TOOLS } from '../../src/protocol/tool-names.ts';
import { ruleIssues } from '../../src/rules/index.ts';
import { isKnownTool, KNOWN_TOOLS } from '../../src/rules/tools/catalog.ts';
import { parsed } from '../support/rule-context.ts';
import { spec } from '../support/spec.ts';
import { TOOL_TABLE } from '../support/tool-table.ts';

const warnings = (text: string, behavior: 'deny' | 'ask' = 'deny') =>
  ruleIssues([parsed(text, behavior)], KNOWN_TOOLS);

describe('the table copied into the tests lists the documented tools', () => {
  test('46 rows, the names of DOCUMENTED_TOOLS in the table order', () => {
    expect(TOOL_TABLE.map((row) => row.tool)).toEqual([...DOCUMENTED_TOOLS]);
    expect(TOOL_TABLE).toHaveLength(46);
  });
});

for (const { tool } of TOOL_TABLE) {
  spec(`tools.tool.${tool}`, () => {
    const removed = (REMOVED_TOOLS as readonly string[]).includes(tool);

    test(`a deny or ask rule naming ${tool} is no typo`, () => {
      expect(warnings(tool)).toEqual([]);
      expect(warnings(tool, 'ask')).toEqual([]);
    });

    test(`${tool} is ${removed ? 'a removed tool, not a known one' : 'a known tool'}`, () => {
      expect(isKnownTool(tool)).toBe(!removed);
    });

    test(`a misspelling of ${tool} is a typo, a label is not its name`, () => {
      const typo = `${tool}x`;
      expect(warnings(typo)).toHaveLength(1);
      expect(warnings(typo)[0]?.message).toContain(`"${typo}" matches no known tool`);
      expect(warnings(typo, 'ask')).toHaveLength(1);
    });
  });
}

describe('permissions.md § Tool name wildcards: what the check exempts', () => {
  test('a removed tool and a name with "_" or "*" never warn; an allow rule never warns', () => {
    expect(warnings('TaskOutput')).toEqual([]);
    expect(warnings('mcp__github__get_issue')).toEqual([]);
    expect(warnings('Task*')).toEqual([]);
    expect(ruleIssues([parsed('Bahs', 'allow')], KNOWN_TOOLS)).toEqual([]);
  });

  test('the label a tool shows in the transcript is not a known tool', () => {
    expect(warnings('Stop Task')).toHaveLength(1);
    expect(isKnownTool('Stop Task')).toBe(false);
    expect(isKnownTool('Task')).toBe(false);
  });
});
