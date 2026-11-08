/**
 * mcp.md § Tools with invalid input schemas (top-level property names of 1 to 64 characters of ASCII letters,
 * digits, `_`, `.`, `-`; the JSON Schema draft 2020-12 meta-schema for a schema with no `$schema` or the
 * 2020-12 one; with flag fetching off the tool is sent and the log says `input schema would be rejected by
 * the Anthropic API`); errors.md § Tool input schema is invalid. The combinators are in mcp-tool-schema.test.ts.
 */
import { describe, expect, test } from 'bun:test';
import {
  excludedToolsNotice,
  prepareMcpTool,
  type McpToolDeclaration,
  type McpToolPolicy,
} from '../../src/index.ts';
import { spec } from '../support/spec.ts';

const ON: McpToolPolicy = { rewriteRootCombinators: true, excludeInvalid: true };
const tool = (inputSchema: Record<string, unknown>, description?: string): McpToolDeclaration => ({
  name: 'lookup',
  ...(description === undefined ? {} : { description }),
  inputSchema,
});
const string = { type: 'string' };

describe('Tools with invalid input schemas', () => {
  const NAME_ERROR = 'is not a valid property name';

  spec('mcp.behavior.Tools with invalid input schemas', () => {
    test('top-level property names are 1 to 64 characters of ASCII letters, digits, _, . and -', () => {
      const ok = ['a', 'A_b.c-d', 'x'.repeat(64), '0', '-', '.'];
      for (const name of ok) {
        const schema = { type: 'object', properties: { [name]: string } };
        expect(prepareMcpTool(tool(schema), ON).sent).toBe(true);
      }
      const bad = ['', 'x'.repeat(65), 'has space', 'naïve', 'a/b', 'a:b', 'a$b', '日本'];
      for (const name of bad) {
        const result = prepareMcpTool(tool({ type: 'object', properties: { [name]: string } }), ON);
        expect(result.sent).toBe(false);
        if (result.sent) return;
        expect(result.reasons.join(' ')).toContain(NAME_ERROR);
      }
    });

    test('only top-level names are checked: a nested object may use any key', () => {
      const schema = {
        type: 'object',
        properties: { outer: { type: 'object', properties: { 'has space': string } } },
      };
      expect(prepareMcpTool(tool(schema), ON).sent).toBe(true);
    });

    test('a schema that breaks the draft 2020-12 meta-schema is excluded, the server other tools are unaffected', () => {
      const broken = [
        { type: 'strin' },
        { type: 5 },
        { type: 'object', properties: [] },
        { type: 'object', properties: { a: { type: 'nope' } } },
        { type: 'object', required: 'a' },
        { type: 'object', required: ['a', 'a'] },
        { type: 'object', required: [1] },
        { type: 'object', additionalProperties: 'yes' },
        { type: 'object', properties: { a: { minLength: -1 } } },
        { type: 'object', properties: { a: { multipleOf: 0 } } },
        { type: 'object', properties: { a: { enum: 'x' } } },
        { type: 'object', properties: { a: { items: [string] } } },
        { type: 'object', properties: { a: { pattern: 5 } } },
        { type: 'object', properties: { a: { oneOf: [] } } },
        { type: 'object', properties: { a: { $ref: 5 } } },
        { type: ['object', 'object'] },
        { type: 'object', $defs: { a: 5 } },
      ];
      for (const schema of broken) {
        const result = prepareMcpTool(tool(schema), ON);
        expect(result.sent).toBe(false);
        if (result.sent) return;
        expect(result.log.join('\n')).toContain('lookup');
      }
      expect(prepareMcpTool(tool({ type: 'object', properties: { fine: string } }), ON).sent).toBe(
        true,
      );
    });

    test('valid schemas of every shape pass the check', () => {
      const valid: Record<string, unknown>[] = [
        {},
        { type: 'object' },
        { type: ['object', 'null'] },
        {
          type: 'object',
          properties: {
            a: { type: 'string', minLength: 1, maxLength: 5, pattern: '^a', format: 'email' },
            b: { type: 'integer', minimum: 0, exclusiveMaximum: 10, multipleOf: 2 },
            c: {
              type: 'array',
              items: string,
              prefixItems: [string],
              minItems: 0,
              uniqueItems: true,
            },
            d: { enum: ['x', 1, null] },
            e: { const: { any: 'thing' } },
            t: true,
            f: { $ref: '#/$defs/f' },
            g: { oneOf: [string, { type: 'number' }], default: 'x', title: 'g', description: 'd' },
            h: { type: 'object', patternProperties: { '^x': string }, additionalProperties: false },
            i: JSON.parse('{"not":{"type":"null"},"if":{},"then":{"type":"string"},"else":{}}'),
            j: { dependentRequired: { a: ['b'] }, dependentSchemas: { a: string } },
            k: { unevaluatedProperties: false, contains: string, minContains: 1 },
          },
          required: ['a'],
          $defs: { f: string },
          $comment: 'c',
          'x-unknown': 'keywords the vocabulary does not know are allowed',
        },
      ];
      for (const schema of valid) {
        expect(prepareMcpTool(tool(schema), ON).sent).toBe(true);
      }
    });

    test('a schema that declares draft 2020-12 is checked like one with no $schema', () => {
      const declared = 'https://json-schema.org/draft/2020-12/schema';
      const result = prepareMcpTool(tool({ $schema: declared, type: 'strin' }), ON);
      expect(result.sent).toBe(false);
      expect(prepareMcpTool(tool({ $schema: declared, type: 'object' }), ON).sent).toBe(true);
    });

    test('a schema that declares another dialect skips the meta-schema check, but not the property-name check', () => {
      const old = 'http://json-schema.org/draft-07/schema#';
      expect(prepareMcpTool(tool({ $schema: old, type: 'strin' }), ON).sent).toBe(true);
      const named = prepareMcpTool(
        tool({ $schema: old, type: 'object', properties: { 'has space': string } }),
        ON,
      );
      expect(named.sent).toBe(false);
    });

    test('with flag fetching off the tool is sent unchanged and the log records the line the docs quote', () => {
      const broken = tool({ type: 'object', properties: { 'has space': string } });
      const result = prepareMcpTool(broken, { ...ON, excludeInvalid: false });
      expect(result.sent).toBe(true);
      if (!result.sent) return;
      expect(result.tool).toEqual(broken);
      expect(result.log.join('\n')).toContain(
        'input schema would be rejected by the Anthropic API',
      );
    });

    test('a valid tool leaves nothing in the log whether or not the rules are enforced', () => {
      const fine = tool({ type: 'object', properties: { a: string } });
      expect(prepareMcpTool(fine, ON).log).toEqual([]);
      expect(prepareMcpTool(fine, { ...ON, excludeInvalid: false }).log).toEqual([]);
    });

    test('Claude is told which tools were excluded and why', () => {
      const result = prepareMcpTool(
        { name: 'bad_tool', inputSchema: { type: 'object', properties: { 'a b': string } } },
        ON,
      );
      if (result.sent) throw new Error('expected an exclusion');
      const notice = excludedToolsNotice([{ name: 'bad_tool', reasons: result.reasons }]);
      expect(notice).toContain('bad_tool');
      expect(notice).toContain(result.reasons[0] ?? 'unreachable');
      expect(excludedToolsNotice([])).toBeUndefined();
    });
  });

  test('a schema root that is not an object is no schema the API takes', () => {
    const result = prepareMcpTool({ name: 'odd', inputSchema: 'oops' }, ON);
    expect(result.sent).toBe(false);
  });
});
