/** The doc's own example values for the `tool_response` of an Agent call (hooks.md, "Agent"). */
import { parseAgentResponse } from '../../src/rules/index.ts';

export const COMPLETED = {
  status: 'completed',
  agentId: 'a4d2c8f1e0b3a297',
  content: [{ type: 'text', text: 'Found 12 endpoints...' }],
  resolvedModel: 'claude-sonnet-4-5',
  totalTokens: 12450,
  totalDurationMs: 48211,
  totalToolUseCount: 7,
  usage: {
    input_tokens: 8320,
    output_tokens: 410,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 3720,
  },
};

export const LAUNCHED = {
  status: 'async_launched',
  agentId: 'a4d2c8f1e0b3a297',
  description: 'Find API endpoints',
  prompt: 'Find all API endpoints',
  outputFile: '/tmp/agents/a4d2c8f1e0b3a297.output',
  resolvedModel: 'claude-sonnet-4-5',
};

export const without = (record: Record<string, unknown>, field: string): Record<string, unknown> =>
  Object.fromEntries(Object.entries(record).filter(([key]) => key !== field));

export const messages = (raw: unknown): string[] =>
  parseAgentResponse(raw).issues.map((found) => `${found.path}: ${found.message}`);
