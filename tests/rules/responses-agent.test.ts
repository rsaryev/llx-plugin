/**
 * hooks.md § PreToolUse input > Agent (the `tool_response` table of a foreground Agent call, and
 * the three paragraphs after it: `SubagentHandback`, "For background subagents ... `tool_response`
 * carries no usage fields", and "On a `completed` response, `resolvedModel` names the model the
 * subagent started on, which can differ from the `model` value in `tool_input`"). The kit reads a
 * PostToolUse `tool_response` into the `completed` or `async_launched` member of a union; a wrong
 * type or a missing field is a PluginIssue at `tool_response.<field>`, nothing throws. Where the
 * docs leave the shape open (the status of a remote launch, a one-model `modelsUsed`, severities,
 * whether a usage field on a launch is dropped) the choice is a judgment (spec/judgments.md),
 * tested outside spec().
 *
 * The shapes tie to the SDK's `AgentOutput` at compile time (see agent-response.ts).
 */
import { expect, test } from 'bun:test';
import { parseAgentResponse } from '../../src/rules/index.ts';
import { COMPLETED, LAUNCHED, messages, without } from '../support/agent-response.ts';
import { spec } from '../support/spec.ts';

/** The field is a number the docs type as "number": a string, `null` and a missing value are issues. */
const numberField = (field: 'totalTokens' | 'totalDurationMs' | 'totalToolUseCount'): void => {
  test(`${field} is read as a number`, () => {
    const parsed = parseAgentResponse(COMPLETED);
    expect(parsed.issues).toEqual([]);
    expect(parsed.response).toMatchObject({ [field]: COMPLETED[field] });
  });
  test(`${field} given as text is an issue at tool_response.${field}`, () => {
    expect(messages({ ...COMPLETED, [field]: '7' })).toEqual([
      `tool_response.${field}: expected a number`,
    ]);
  });
  test(`${field} missing from a completed response is an issue`, () => {
    expect(messages(without(COMPLETED, field))).toEqual([`tool_response.${field}: is required`]);
  });
};

spec('tools.input.Agent.status', () => {
  test('"completed" is a foreground subagent and carries the run telemetry', () => {
    const parsed = parseAgentResponse(COMPLETED);
    expect(parsed.issues).toEqual([]);
    expect(parsed.response?.status).toBe('completed');
  });

  test('"async_launched" is a background subagent and carries the launch fields', () => {
    const parsed = parseAgentResponse(LAUNCHED);
    expect(parsed.issues).toEqual([]);
    const actual: unknown = parsed.response;
    expect(actual).toEqual(LAUNCHED);
  });

  test('the two statuses are the two members of one union: each requires its own fields', () => {
    // A launch has no totals, so the same object read as completed would be missing them.
    expect(messages({ ...LAUNCHED, status: 'completed' })).toContain(
      'tool_response.totalTokens: is required',
    );
    // A completed response has no outputFile, so read as a launch it is missing it.
    expect(messages({ ...COMPLETED, status: 'async_launched' })).toContain(
      'tool_response.outputFile: is required',
    );
  });

  test('a launch needs agentId, description, prompt and outputFile, each text', () => {
    for (const field of ['agentId', 'description', 'prompt', 'outputFile']) {
      expect(messages(without(LAUNCHED, field))).toEqual([`tool_response.${field}: is required`]);
      expect(messages({ ...LAUNCHED, [field]: 42 })).toEqual([
        `tool_response.${field}: expected a string`,
      ]);
    }
  });

  test('a status the table does not list is an issue, a missing one too, and no response comes back', () => {
    for (const raw of [{ ...COMPLETED, status: 'finished' }, without(COMPLETED, 'status')]) {
      const parsed = parseAgentResponse(raw);
      expect(parsed.response).toBeUndefined();
      expect(parsed.issues).toHaveLength(1);
      expect(parsed.issues[0]?.path).toBe('tool_response.status');
      expect(parsed.issues[0]?.severity).toBe('error');
    }
    expect(messages(without(COMPLETED, 'status'))).toEqual(['tool_response.status: is required']);
    expect(messages({ ...COMPLETED, status: 'finished' })).toEqual([
      'tool_response.status: expected one of completed, async_launched',
    ]);
  });

  test('a response that is not an object is an issue, never a throw', () => {
    for (const raw of ['done', 3, null, undefined, [COMPLETED]]) {
      const parsed = parseAgentResponse(raw);
      expect(parsed.response).toBeUndefined();
      expect(messages(raw)).toEqual(['tool_response: expected an object']);
    }
  });
});

spec('tools.input.Agent.agentId', () => {
  test('both members carry the identifier of the subagent run', () => {
    expect(parseAgentResponse(COMPLETED).response).toMatchObject({ agentId: 'a4d2c8f1e0b3a297' });
    expect(parseAgentResponse(LAUNCHED).response).toMatchObject({ agentId: 'a4d2c8f1e0b3a297' });
  });

  test('a missing or non-text agentId is an issue on either member', () => {
    expect(messages(without(COMPLETED, 'agentId'))).toEqual(['tool_response.agentId: is required']);
    expect(messages({ ...LAUNCHED, agentId: 42 })).toEqual([
      'tool_response.agentId: expected a string',
    ]);
  });
});

spec('tools.input.Agent.content', () => {
  test("content is the subagent's final text blocks, as the doc's example", () => {
    const parsed = parseAgentResponse(COMPLETED);
    expect(parsed.response).toMatchObject({
      content: [{ type: 'text', text: 'Found 12 endpoints...' }],
    });
  });

  test('a block without text, with a text that is not a string, or that is not text is an issue at its index', () => {
    expect(messages({ ...COMPLETED, content: [{ type: 'text' }] })).toEqual([
      'tool_response.content.0.text: is required',
    ]);
    expect(messages({ ...COMPLETED, content: [{ type: 'text', text: 1 }] })).toEqual([
      'tool_response.content.0.text: expected a string',
    ]);
    expect(messages({ ...COMPLETED, content: [{ type: 'image', text: 'x' }] })).toEqual([
      'tool_response.content.0.type: expected "text"',
    ]);
    expect(messages({ ...COMPLETED, content: [{ text: 'x' }] })).toEqual([
      'tool_response.content.0.type: expected "text"',
    ]);
    expect(messages({ ...COMPLETED, content: 'Found 12 endpoints' })).toEqual([
      'tool_response.content: expected an array',
    ]);
  });

  test('a completed response without content is an issue', () => {
    expect(messages(without(COMPLETED, 'content'))).toEqual(['tool_response.content: is required']);
  });

  test('a launch has no content: it is not required there', () => {
    expect(parseAgentResponse(LAUNCHED).issues).toEqual([]);
  });
});

spec('tools.input.Agent.resolvedModel', () => {
  test('resolvedModel names the model the subagent started on', () => {
    expect(parseAgentResponse(COMPLETED).response).toMatchObject({
      resolvedModel: 'claude-sonnet-4-5',
    });
  });

  test('on a launch it is the model in use when the agent moved to the background', () => {
    const parsed = parseAgentResponse({ ...LAUNCHED, resolvedModel: 'claude-haiku-4-5' });
    expect(parsed.issues).toEqual([]);
    expect(parsed.response).toMatchObject({
      status: 'async_launched',
      resolvedModel: 'claude-haiku-4-5',
    });
  });

  test('a response without a resolvedModel is accepted; one that is not text is an issue', () => {
    expect(parseAgentResponse(without(COMPLETED, 'resolvedModel')).issues).toEqual([]);
    expect(parseAgentResponse(without(LAUNCHED, 'resolvedModel')).issues).toEqual([]);
    expect(messages({ ...COMPLETED, resolvedModel: 7 })).toEqual([
      'tool_response.resolvedModel: expected a string',
    ]);
  });
});

spec('tools.input.Agent.modelsUsed', () => {
  test("after a swap, the models are listed in order: the doc's example", () => {
    const swapped = ['claude-sonnet-4-5', 'claude-haiku-4-5'];
    const parsed = parseAgentResponse({ ...COMPLETED, modelsUsed: swapped });
    expect(parsed.issues).toEqual([]);
    expect(parsed.response).toMatchObject({ modelsUsed: swapped });
  });

  test('a response without modelsUsed has none: it is set only when the model was swapped', () => {
    expect(parseAgentResponse(COMPLETED).response).not.toHaveProperty('modelsUsed');
    expect(parseAgentResponse(LAUNCHED).response).not.toHaveProperty('modelsUsed');
  });

  test('a launch carries it too', () => {
    expect(parseAgentResponse({ ...LAUNCHED, modelsUsed: ['a', 'b'] }).response).toMatchObject({
      modelsUsed: ['a', 'b'],
    });
  });

  test('a list of something other than text is an issue at its index', () => {
    expect(messages({ ...COMPLETED, modelsUsed: ['a', 3] })).toEqual([
      'tool_response.modelsUsed.1: expected a string',
    ]);
    expect(messages({ ...COMPLETED, modelsUsed: 'a' })).toEqual([
      'tool_response.modelsUsed: expected an array',
    ]);
  });
});

spec('tools.input.Agent.totalTokens', () => {
  numberField('totalTokens');
});

spec('tools.input.Agent.totalDurationMs', () => {
  numberField('totalDurationMs');
});

spec('tools.input.Agent.totalToolUseCount', () => {
  numberField('totalToolUseCount');
});

spec('tools.input.Agent.usage', () => {
  test('usage is the per-type breakdown: the four keys of the table', () => {
    const parsed = parseAgentResponse(COMPLETED);
    expect(parsed.issues).toEqual([]);
    expect(parsed.response).toMatchObject({ usage: COMPLETED.usage });
  });

  test('each of the four keys is required, and the cache counts may be null', () => {
    for (const key of Object.keys(COMPLETED.usage)) {
      expect(messages({ ...COMPLETED, usage: without(COMPLETED.usage, key) })).toEqual([
        `tool_response.usage.${key}: is required`,
      ]);
    }
    const nulls = {
      ...COMPLETED.usage,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
    };
    expect(parseAgentResponse({ ...COMPLETED, usage: nulls }).issues).toEqual([]);
  });

  test('a count that is not a number is an issue at its key', () => {
    expect(messages({ ...COMPLETED, usage: { ...COMPLETED.usage, input_tokens: '8320' } })).toEqual(
      ['tool_response.usage.input_tokens: expected a number'],
    );
  });

  test('usage that is not an object, or missing from a completed response, is an issue', () => {
    expect(messages({ ...COMPLETED, usage: 12450 })).toEqual([
      'tool_response.usage: expected an object',
    ]);
    expect(messages(without(COMPLETED, 'usage'))).toEqual(['tool_response.usage: is required']);
  });

  test('"For background subagents ... tool_response carries no usage fields": a launch exposes none', () => {
    const parsed = parseAgentResponse(LAUNCHED);
    for (const field of ['usage', 'totalTokens', 'totalDurationMs', 'totalToolUseCount']) {
      expect(parsed.response).not.toHaveProperty(field);
    }
    expect(parsed.issues).toEqual([]);
  });

  test('a launch that does carry usage fields does not expose them, and says so', () => {
    const parsed = parseAgentResponse({ ...LAUNCHED, usage: COMPLETED.usage, totalTokens: 1 });
    const actual: unknown = parsed.response;
    expect(actual).toEqual(LAUNCHED);
    expect(parsed.issues.map((found) => [found.severity, found.path])).toEqual([
      ['warning', 'tool_response.totalTokens'],
      ['warning', 'tool_response.usage'],
    ]);
  });
});
