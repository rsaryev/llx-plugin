import { z } from 'zod';
import type { ModsNamespaceApi } from '../types.ts';
import { call, parse, type Deps } from './call.ts';
import { droppedPrompt, refusing, waitsInQueue } from './refusal.ts';

/** `$.prompt.submit({ text, asUser })` (api.md, "Start a turn from a background job"). */
const submit = z.looseObject({ text: z.string(), asUser: z.boolean().optional() });
const textArg = z.union([z.string(), z.looseObject({ text: z.string() })]);
const textEvent = z.looseObject({ text: z.string() });

const textOf = (label: string, value: unknown): string => {
  const given = parse(label, textArg, value);
  return typeof given === 'string' ? given : given.text;
};

export function promptApi(deps: Deps): ModsNamespaceApi<'prompt'> {
  const { prompts } = deps.ports;
  return {
    // Claude reads text after a sentence that names the mod as the sender; `asUser: true` sends the
    // user's own words without it, and `asUser: false` is a plain submit. The sentence is the host's:
    // the port gets `from` or `asUser`.
    submit: async (...args) => {
      const lent = deps.scope.current().lentTo;
      // Judgment: "`$.prompt.submit` rejects while the turn is waiting on that hook"; the docs give no message.
      if (lent !== undefined) {
        throw new Error(`$.prompt.submit: the turn is waiting on a hook of ${lent}`);
      }
      const request = parse('$.prompt.submit', submit, args[0]);
      // The `session.start` of a fresh copy does not submit what the first copy submitted.
      return deps.replay.once(deps.plugin, 'prompt.submit', () =>
        call(
          deps,
          'prompt.submit',
          request,
          refusing(deps, 'prompt.submit', async (e) => {
            const { text, asUser } = parse('$.prompt.submit', submit, e);
            const prompt = asUser === true ? { text, asUser } : { text, from: deps.plugin };
            return waitsInQueue(
              deps.gate.interrupted(),
              (queue) => prompts.submit(prompt, queue),
              droppedPrompt,
            );
          }),
        ),
      );
    },
    read: async () => call(deps, 'prompt.read', {}, () => prompts.read()),
    fill: async (...args) =>
      call(deps, 'prompt.fill', { text: textOf('$.prompt.fill', args[0]) }, (e) =>
        prompts.fill(parse('$.prompt.fill', textEvent, e).text),
      ),
    suggest: async (...args) =>
      call(deps, 'prompt.suggest', { text: textOf('$.prompt.suggest', args[0]) }, (e) =>
        prompts.suggest(parse('$.prompt.suggest', textEvent, e).text),
      ),
    compose: async () => call(deps, 'prompt.compose', {}, () => prompts.compose()),
  };
}
