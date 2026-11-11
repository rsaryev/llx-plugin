import type { AgentOrigin } from '../../src/format/agent-record.ts';
import type { readAgent } from '../../src/format/agent.ts';

export const file = (front: string, body = 'You are a reviewer.\n'): string =>
  `---\n${front}\n---\n${body}`;
export const FILES = ['project', 'user', 'managed'] as const;
export const at = (source: (typeof FILES)[number], path = 'agents/reviewer.md'): AgentOrigin => ({
  source,
  path,
});
export const plugin = (relativePath?: string, path = 'agents/reviewer.md'): AgentOrigin => ({
  source: 'plugin',
  path,
  plugin: { name: 'my-plugin', relativePath },
});

export const loaded = (result: ReturnType<typeof readAgent>) => {
  if (result.outcome !== 'loaded') throw new Error(`expected loaded, got ${result.reason}`);
  return result.agent;
};
