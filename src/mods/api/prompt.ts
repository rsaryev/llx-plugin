import { z } from 'zod';
import type { ModsNamespaceApi } from '../types.ts';
import { call, parse, pluginOrigin, type Deps } from './call.ts';
import { droppedPrompt, refusing, waitsInQueue } from './refusal.ts';
import { runScopedModCall } from './scoped-call.ts';

/** `$.prompt.submit({ text, asUser })` (api.md, "Start a turn from a background job"). */
const submit = z.looseObject({
  text: z.string(),
  asUser: z.boolean().optional(),
  context: z.array(z.string()).optional(),
});
const textArg = z.union([z.string(), z.looseObject({ text: z.string() })]);
const textEvent = z.looseObject({ text: z.string() });

/** A text as `{ text }`; a string, which the declarations do not name, is taken as its text (judgment, D7). */
const asInput = (label: string, value: unknown): Readonly<Record<string, unknown>> => {
  const given = parse(label, textArg, value);
  return typeof given === 'string' ? { text: given } : given;
};

/**
 * `$.prompt.fill({ text, mode?, decorations?, cursor? })` (claude-code/index.d.ts:9284,
 * `PromptFillArgs`): `mode` `replace` when left out, as its event pins it (:4381); a `cursor` that is
 * not an integer is refused.
 */
const decorations = z.array(z.looseObject({ start: z.number(), end: z.number() }));
const fill = z.looseObject({
  text: z.string(),
  mode: z.enum(['replace', 'append', 'insert']).default('replace'),
  decorations: decorations.optional(),
  cursor: z.number().int().optional(),
});

/** `$.prompt.paint({ decorations, text? })` (claude-code/index.d.ts:3168, `PromptPaintArgs`). */
const paint = z.looseObject({ decorations, text: z.string().optional() });

/** `$.prompt.media({ id, offset? })` (:3143, `PromptMediaArgs`): `offset` an earlier read's `next`. */
const media = z.object({ id: z.string(), offset: z.number().int().nonnegative().optional() });
const mediaRequest = (given: z.infer<typeof media>): { id: string; offset?: number } =>
  given.offset === undefined ? { id: given.id } : { id: given.id, offset: given.offset };

export function promptApi(deps: Deps): ModsNamespaceApi<'prompt'> {
  const { prompts, promptBox } = deps.ports;
  return {
    // Claude reads text after a sentence that names the mod as the sender; `asUser: true` sends the
    // user's own words without it, and `asUser: false` is a plain submit. The sentence is the host's:
    // the port gets `from` or `asUser`.
    submit: async (...args) => {
      runScopedModCall(deps.scope, 'prompt.submit', () => undefined);
      // "with `e.origin` `{ kind: 'plugin', name }`" (claude-code/index.d.ts:3113); `wait` is "False for a prompt a plugin submitted" (:9967).
      const request = {
        ...parse('$.prompt.submit', submit, args[0]),
        origin: pluginOrigin(deps),
        wait: false,
      };
      // The `session.start` of a fresh copy does not submit what the first copy submitted.
      return deps.replay.once(deps.plugin, 'prompt.submit', () =>
        call(
          deps,
          'prompt.submit',
          request,
          refusing(deps, 'prompt.submit', async (e) => {
            const { text, asUser, context } = parse('$.prompt.submit', submit, e);
            const prompt = asUser === true ? { text, asUser } : { text, from: deps.plugin };
            const entered = await waitsInQueue(
              deps.gate.interrupted(),
              (queue) => prompts.submit(prompt, queue),
              droppedPrompt,
            );
            // From core, the prompt that entered: the text and context that arrived (claude-code/index.d.ts:9987).
            if (entered.drop !== undefined) return entered;
            return { ...entered, text, ...(context === undefined ? {} : { context }) };
          }),
        ),
      );
    },
    read: async () => call(deps, 'prompt.read', {}, () => prompts.read()),
    fill: async (...args) =>
      call(
        deps,
        'prompt.fill',
        {
          ...parse('$.prompt.fill', fill, asInput('$.prompt.fill', args[0])),
          origin: pluginOrigin(deps),
        },
        (e) => {
          const { text, origin: _origin, ...where } = parse('$.prompt.fill', fill, e);
          return prompts.fill(text, where);
        },
      ),
    // "The engine's own read, no event: no hook answers for it" (:3137); the host knows the submission in flight.
    media: async (...args) =>
      promptBox.media(mediaRequest(parse('$.prompt.media', media, args[0])), deps.plugin),
    // "Hooks may rewrite or `{ deny }` it" (:3160): the event `prompt.paint`, then the box.
    paint: async (...args) =>
      call(deps, 'prompt.paint', parse('$.prompt.paint', paint, args[0]), (e) =>
        promptBox.paint(parse('$.prompt.paint', paint, e), deps.plugin),
      ),
    suggest: async (...args) =>
      call(
        deps,
        'prompt.suggest',
        { ...asInput('$.prompt.suggest', args[0]), origin: pluginOrigin(deps) },
        (e) => prompts.suggest(parse('$.prompt.suggest', textEvent, e).text),
      ),
    // `{ sections }`, as a `prompt.compose` hook answers it (claude-code/index.d.ts:3192).
    compose: async () =>
      call(deps, 'prompt.compose', {}, async () => ({ sections: await prompts.compose() })),
  };
}
