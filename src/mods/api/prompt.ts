import { z } from 'zod';
import type { ModsNamespaceApi } from '../types.ts';
import { call, parse, type Deps } from './call.ts';

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
      return call(deps, 'prompt.submit', parse('$.prompt.submit', submit, args[0]), (e) => {
        const { text, asUser } = parse('$.prompt.submit', submit, e);
        return prompts.submit(asUser === true ? { text, asUser } : { text, from: deps.plugin });
      });
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
