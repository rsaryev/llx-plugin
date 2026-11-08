import { z } from 'zod';
import { promptDroppedText } from '../events/index.ts';
import type { ModsHost } from './host.ts';

const DROP = z.looseObject({ drop: z.string() });

/** plugins/mods/events.md, "Rewrite or add to a prompt": restore a dropped prompt and its message. */
export async function runModPromptSubmit(input: {
  readonly host: Pick<ModsHost, 'fire'>;
  readonly text: string;
  readonly submit: (event: unknown) => Promise<unknown>;
}) {
  const result = await input.host.fire(
    'prompt.submit',
    { text: input.text },
    { core: input.submit },
  );
  const dropped = DROP.safeParse(result);
  return dropped.success
    ? { result, restoredText: input.text, notice: promptDroppedText(dropped.data.drop) }
    : { result };
}
