/**
 * The choices spec/judgments.md records for the Agent `tool_response` where hooks.md ("Agent") is
 * silent: a status the table does not list (the SDK's remote launch), fields the table does not
 * name, and that the parsed response is a copy. Tested outside spec(), never counted as compatibility.
 */
import { describe, expect, test } from 'bun:test';
import { parseAgentResponse } from '../../src/rules/index.ts';
import { COMPLETED, messages } from '../support/agent-response.ts';

describe('agent response (judgments, spec/judgments.md)', () => {
  test('a remote launch is not in the hooks.md table: it is refused as an unlisted status', () => {
    const remote = {
      status: 'remote_launched',
      taskId: 't',
      sessionUrl: 'u',
      description: 'd',
      prompt: 'p',
      outputFile: 'o',
    };
    const parsed = parseAgentResponse(remote);
    expect(parsed.response).toBeUndefined();
    expect(messages(remote)).toEqual([
      'tool_response.status: expected one of completed, async_launched',
    ]);
  });

  test('fields the table does not list (agentType, toolStats, citations) are not part of the response', () => {
    const parsed = parseAgentResponse({
      ...COMPLETED,
      agentType: 'Explore',
      toolStats: { readCount: 1 },
      content: [{ type: 'text', text: 'x', citations: [] }],
    });
    expect(parsed.issues).toEqual([]);
    const actual: unknown = parsed.response;
    expect(actual).toEqual({
      ...COMPLETED,
      content: [{ type: 'text', text: 'x' }],
    });
  });

  test('the response does not alias the input', () => {
    const raw = structuredClone(COMPLETED);
    const parsed = parseAgentResponse(raw);
    raw.content[0] = { type: 'text', text: 'changed' };
    expect(parsed.response).toMatchObject({ content: [{ text: 'Found 12 endpoints...' }] });
  });
});
