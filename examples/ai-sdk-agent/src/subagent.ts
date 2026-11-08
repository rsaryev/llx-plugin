import { randomUUID } from 'node:crypto';
import type { PluginSession } from '@rsaryev/claude-plugin-kit';
import { generateText, isStepCount, tool, type LanguageModel } from 'ai';
import { z } from 'zod';
import { builtinTools, type ToolContext } from './tools.ts';

/** The plugins' agents as subagents: each runs with its own prompt, tools and model on the same loop. */
export async function agentTool(
  session: PluginSession,
  model: LanguageModel,
  context: ToolContext,
) {
  const { resolved } = await session.agents();
  const names = resolved
    .map((agent) => `- ${agent.name}: ${agent.definition.description}`)
    .join('\n');
  return tool({
    description: `Launch a subagent for a self-contained task. Available subagent_type values:\n${names || '(none)'}`,
    inputSchema: z.object({
      description: z.string(),
      prompt: z.string(),
      subagent_type: z.string(),
    }),
    execute: async ({ prompt, subagent_type }) => {
      const agent = resolved.find((a) => a.name === subagent_type);
      if (!agent) return `Unknown subagent_type ${subagent_type}`;
      const agentId = randomUUID();
      const { signal, trace } = context;
      const started = await session.dispatch(
        'SubagentStart',
        { agent_id: agentId, agent_type: agent.name },
        { signal },
      );
      const all = builtinTools(context);
      const allowed = agent.definition.tools;
      const tools = allowed
        ? Object.fromEntries(Object.entries(all).filter(([name]) => allowed.includes(name)))
        : all;
      const result = await generateText({
        model,
        instructions: [agent.definition.prompt, ...started.additionalContext].join('\n\n'),
        prompt,
        tools,
        stopWhen: isStepCount(20),
        abortSignal: signal,
      });
      await session.dispatch(
        'SubagentStop',
        {
          agent_id: agentId,
          agent_type: agent.name,
          stop_hook_active: false,
          agent_transcript_path: '',
          last_assistant_message: result.text,
        },
        { signal },
      );
      trace.add({ kind: 'agent', name: agent.name, text: result.text });
      return result.text;
    },
  });
}
