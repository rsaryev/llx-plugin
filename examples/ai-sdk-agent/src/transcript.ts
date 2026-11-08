/**
 * The session transcript at `transcript_path`, written the way plugins read it: one JSON line per
 * message block, `{"type":"assistant","message":{"role":"assistant","content":[block]}}`. Hooks such
 * as ralph-loop's Stop hook read the last assistant text from it.
 */
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ModelMessage } from 'ai';

const blocksOf = (message: ModelMessage): readonly unknown[] =>
  typeof message.content === 'string' ? [{ type: 'text', text: message.content }] : message.content;

export async function appendTranscript(
  path: string,
  messages: readonly ModelMessage[],
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const lines = messages.flatMap((message) => {
    const role = message.role === 'tool' ? 'user' : message.role;
    return blocksOf(message).map((block) =>
      JSON.stringify({ type: role, message: { role, content: [block] } }),
    );
  });
  if (lines.length > 0) await appendFile(path, `${lines.join('\n')}\n`);
}
