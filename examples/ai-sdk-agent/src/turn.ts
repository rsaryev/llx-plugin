import type { PluginSession } from '@rsaryev/claude-plugin-kit';
import { generateText, isStepCount, type LanguageModel, type ModelMessage, type ToolSet } from 'ai';
import type { Trace } from './trace.ts';
import { appendTranscript } from './transcript.ts';

export interface Turn {
  readonly transcriptPath: string;
  readonly model: LanguageModel;
  readonly instructions: string;
  readonly tools: ToolSet;
  readonly messages: ModelMessage[];
  readonly session: PluginSession;
  readonly trace: Trace;
  readonly signal: AbortSignal;
  readonly maxSteps: number;
}

/** How many times Stop hooks may send Claude back to work in one turn: a guard against a hook that never lets go. */
const MAX_STOP_ROUNDS = 8;

/**
 * Runs the model until it stops. A `Stop` hook that blocks (or adds context) sends Claude back to
 * work with its reason; `stop_hook_active` tells the hook it is already continuing (hooks.md, "Stop").
 */
export async function runTurn(turn: Turn): Promise<string> {
  let text = '';
  for (let round = 0; round < MAX_STOP_ROUNDS; round++) {
    const result = await generateText({
      model: turn.model,
      instructions: turn.instructions,
      messages: turn.messages,
      tools: turn.tools,
      stopWhen: isStepCount(turn.maxSteps),
      abortSignal: turn.signal,
    });
    turn.messages.push(...result.responseMessages);
    await appendTranscript(turn.transcriptPath, result.responseMessages);
    text = result.text;
    if (text) turn.trace.add({ kind: 'text', text });
    const stop = await turn.session.dispatch(
      'Stop',
      { stop_hook_active: round > 0, last_assistant_message: text },
      { signal: turn.signal },
    );
    for (const message of stop.systemMessages)
      turn.trace.add({ kind: 'hook', event: 'Stop', detail: message });
    if (stop.proceed && stop.effects.continuesTurn !== true) return text;
    const reason = stop.block?.reason || stop.additionalContext.join('\n');
    turn.trace.add({ kind: 'hook', event: 'Stop', detail: `continue: ${reason}` });
    const feedback: ModelMessage = {
      role: 'user',
      content: `<system-reminder>\nStop hook feedback:\n${reason}\n</system-reminder>`,
    };
    turn.messages.push(feedback);
    await appendTranscript(turn.transcriptPath, [feedback]);
  }
  turn.trace.add({
    kind: 'issue',
    message: `Stop hooks kept the turn going for ${MAX_STOP_ROUNDS} rounds; stopping.`,
  });
  return text;
}
