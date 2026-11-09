/**
 * mcp.md § Tool input schemas with a root-level combinator (`anyOf`, `oneOf`, `allOf` at the schema
 * root are flattened into one object; a description sentence names the parameter groups; a tool
 * Claude Code cannot flatten is skipped), § Tools with invalid input schemas (top-level property
 * names of 1 to 64 characters of ASCII letters, digits, `_`, `.`, `-`; JSON Schema draft 2020-12
 * meta-schema for a schema with no `$schema` or the 2020-12 one; with flag fetching off the tool is
 * sent and the log says `input schema would be rejected by the Anthropic API`), § Tools whose input
 * schema the API refuses (the log line `the API refused this tool's input schema`, `The API said:`, the
 * tool resent without parameters); errors.md § Tool input schema is invalid (the property-name
 * pattern). The wording of the description sentence and of the notice to Claude is a judgment
 * (spec/judgments.md), asserted outside `spec(...)`.
 */
import { expect, test } from 'bun:test';
import {
  prepareMcpTool,
  refusedSchemaFallback,
  type McpToolDeclaration,
  type McpToolPolicy,
} from '../../src/entry/format.ts';
import { spec } from '../support/spec.ts';

const ON: McpToolPolicy = { rewriteRootCombinators: true, excludeInvalid: true };
const tool = (inputSchema: Record<string, unknown>, description?: string): McpToolDeclaration => ({
  name: 'lookup',
  ...(description === undefined ? {} : { description }),
  inputSchema,
});
const string = { type: 'string' };

spec('mcp.behavior.Tool input schemas with a root-level combinator', () => {
  test('allOf: the properties of every branch are merged and each branch required list still applies', () => {
    const result = prepareMcpTool(
      tool({
        type: 'object',
        allOf: [
          { properties: { a: string }, required: ['a'] },
          { properties: { b: { type: 'number' } }, required: ['b'] },
        ],
      }),
      ON,
    );
    expect(result.sent).toBe(true);
    if (!result.sent) return;
    expect(result.tool.inputSchema).toEqual({
      type: 'object',
      properties: { a: string, b: { type: 'number' } },
      required: ['a', 'b'],
    });
    expect(result.tool.description).toBeUndefined();
  });

  test('anyOf and oneOf: the properties are merged and no required list is enforced by the schema', () => {
    for (const keyword of ['anyOf', 'oneOf']) {
      const result = prepareMcpTool(
        tool({
          type: 'object',
          [keyword]: [
            { properties: { id: string }, required: ['id'] },
            { properties: { name: string }, required: ['name'] },
          ],
        }),
        ON,
      );
      expect(result.sent).toBe(true);
      if (!result.sent) return;
      expect(result.tool.inputSchema).toEqual({
        type: 'object',
        properties: { id: string, name: string },
      });
    }
  });

  test('anyOf and oneOf: a sentence prepended to the description tells which parameters belong together', () => {
    for (const keyword of ['anyOf', 'oneOf']) {
      const result = prepareMcpTool(
        tool(
          {
            [keyword]: [
              { properties: { id: string }, required: ['id'] },
              { properties: { org: string, name: string }, required: ['org', 'name'] },
            ],
          },
          'Finds a record',
        ),
        ON,
      );
      expect(result.sent).toBe(true);
      if (!result.sent) return;
      const description = result.tool.description ?? '';
      expect(description.endsWith('Finds a record')).toBe(true);
      expect(description).toContain('(id)');
      expect(description).toContain('(org, name)');
    }
  });

  test('a tool with no description gets the sentence alone', () => {
    const result = prepareMcpTool(
      tool({ oneOf: [{ properties: { id: string }, required: ['id'] }] }),
      ON,
    );
    expect(result.sent && result.tool.description).toContain('(id)');
  });

  test('a branch with no required list adds no group to the sentence; all of them empty leaves the description alone', () => {
    const result = prepareMcpTool(
      tool({ anyOf: [{ properties: { a: string } }, { properties: { b: string } }] }, 'Original'),
      ON,
    );
    expect(result.sent && result.tool.description).toBe('Original');
  });

  test('combinators nested inside properties are sent unchanged, and a schema with no root combinator is untouched', () => {
    const nested = {
      type: 'object',
      properties: { target: { anyOf: [{ type: 'string' }, { type: 'number' }] } },
      required: ['target'],
    };
    const result = prepareMcpTool(tool(nested, 'D'), ON);
    expect(result).toEqual({ sent: true, tool: tool(nested, 'D'), log: [] });
  });

  test('the root properties and required list join the flattened ones', () => {
    const result = prepareMcpTool(
      tool({
        type: 'object',
        properties: { shared: string },
        required: ['shared'],
        allOf: [{ properties: { a: string }, required: ['a'] }],
        additionalProperties: false,
      }),
      ON,
    );
    expect(result.sent && result.tool.inputSchema).toEqual({
      type: 'object',
      properties: { shared: string, a: string },
      required: ['shared', 'a'],
      additionalProperties: false,
    });
  });

  test('"When Claude Code can\'t produce a schema the API accepts" the one tool is skipped, with the reason', () => {
    const cases = [
      { anyOf: [{ type: 'string' }, { type: 'number' }] },
      { oneOf: [{ $ref: '#/$defs/a' }], $defs: { a: { type: 'object' } } },
      { anyOf: ['not a schema'] },
      { allOf: [] },
    ];
    for (const schema of cases) {
      const result = prepareMcpTool(tool(schema), ON);
      expect(result.sent).toBe(false);
      if (result.sent) return;
      expect(result.reasons.length).toBeGreaterThan(0);
      expect(result.log.join('\n')).toContain('lookup');
    }
  });

  test('a deployment that does not receive the remote configuration that enables the rewrite skips the tool', () => {
    const schema = { anyOf: [{ properties: { a: string }, required: ['a'] }] };
    const off = prepareMcpTool(tool(schema), { ...ON, rewriteRootCombinators: false });
    expect(off.sent).toBe(false);
    expect(prepareMcpTool(tool(schema), ON).sent).toBe(true);
  });

  test('the rewrite is separate from the schema rules: it still runs when those are not enforced', () => {
    const schema = { anyOf: [{ properties: { a: string }, required: ['a'] }] };
    const result = prepareMcpTool(tool(schema), { ...ON, excludeInvalid: false });
    expect(result.sent && 'anyOf' in result.tool.inputSchema).toBe(false);
  });

  test('properties that two branches define differently are both kept, nested in anyOf where the API accepts it', () => {
    const result = prepareMcpTool(
      tool({
        allOf: [{ properties: { x: string } }, { properties: { x: { type: 'number' } } }],
      }),
      ON,
    );
    expect(result.sent && result.tool.inputSchema).toEqual({
      type: 'object',
      properties: { x: { anyOf: [string, { type: 'number' }] } },
    });
  });
});

spec('mcp.behavior.Tools whose input schema the API refuses', () => {
  const declared = tool({ type: 'object', properties: { a: string } }, 'Does a thing');

  test('the request is resent with the tool declared without parameters', () => {
    const fallback = refusedSchemaFallback(declared, 'tools.3.custom.input_schema: not valid');
    expect(fallback.tool).toEqual({
      name: 'lookup',
      description: 'Does a thing',
      inputSchema: { type: 'object', properties: {} },
    });
  });

  test('the log line holds the phrase the docs quote and ends with "The API said:" and the reason', () => {
    const { log } = refusedSchemaFallback(declared, 'JSON schema is invalid');
    expect(log).toContain("the API refused this tool's input schema");
    expect(log.endsWith('The API said: JSON schema is invalid')).toBe(true);
    expect(log).toContain('lookup');
  });
});
