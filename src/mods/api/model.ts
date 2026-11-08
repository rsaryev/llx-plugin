import { z } from 'zod';
import { MOD_LIMITS } from '../../protocol/mods-limits.ts';
import type { ModsNamespaceApi } from '../types.ts';
import { call, isRecord, parse, type Deps } from './call.ts';
import {
  blocksSchema,
  eventText,
  sentBlocks,
  textOrBlocks,
  type TextOrBlocks,
} from './model-blocks.ts';
import type { ModelCall } from './ports.ts';

/** What `$.model.complete` takes (api.md, "Call a model"). */
const request = z.looseObject({
  model: z.string(),
  prompt: textOrBlocks,
  system: textOrBlocks.optional(),
  maxTokens: z.number().int().positive().optional(),
  timeoutMs: z.number().positive().optional(),
  effort: z.string().optional(),
});

/** The event: `prompt` and `system` as strings, `promptBlocks` and `systemBlocks` when the caller passed arrays. */
const event = z.looseObject({
  model: z.string(),
  prompt: z.string(),
  system: z.string().optional(),
  promptBlocks: blocksSchema.optional(),
  systemBlocks: blocksSchema.optional(),
  maxTokens: z.number().int().positive(),
  timeoutMs: z.number().positive().optional(),
  effort: z.string().optional(),
});

const fork = z.looseObject({ prompt: textOrBlocks });
const forkEvent = z.looseObject({ prompt: z.string(), promptBlocks: blocksSchema.optional() });

const field = (name: string, value: TextOrBlocks | undefined): Record<string, unknown> => {
  if (value === undefined) return {};
  const { text, blocks } = eventText(value);
  return { [name]: text, ...(blocks ? { [`${name}Blocks`]: blocks } : {}) };
};

/** The call Claude Code makes for an event the hooks may have changed. `maxTokens` is capped (judgment: the docs say "up to 64,000 or the model's output limit"; the output limit is the host's). */
function modelCall(e: unknown, signal: AbortSignal): ModelCall {
  const p = parse('$.model.complete', event, e);
  return {
    model: p.model,
    prompt: sentBlocks(p.prompt, p.promptBlocks),
    ...(p.system === undefined ? {} : { system: sentBlocks(p.system, p.systemBlocks) }),
    maxTokens: Math.min(p.maxTokens, MOD_LIMITS.maxTokensCap),
    ...(p.effort === undefined ? {} : { effort: p.effort }),
    ...(p.timeoutMs === undefined ? {} : { timeoutMs: p.timeoutMs }),
    signal,
  };
}

export function modelApi(deps: Deps): ModsNamespaceApi<'model'> {
  return {
    complete: async (...args) => {
      const r = parse('$.model.complete', request, args[0]);
      const input = {
        model: r.model,
        ...field('prompt', r.prompt),
        ...field('system', r.system),
        maxTokens: r.maxTokens ?? MOD_LIMITS.maxTokens,
        ...(r.timeoutMs === undefined ? {} : { timeoutMs: r.timeoutMs }),
        ...(r.effort === undefined ? {} : { effort: r.effort }),
      };
      return call(deps, 'model.complete', input, (e) =>
        deps.ports.models.complete(modelCall(e, deps.signal)),
      );
    },
    fork: async (...args) => {
      const input = field('prompt', parse('$.model.fork', fork, args[0]).prompt);
      return call(deps, 'model.fork', input, (e) => {
        const p = parse('$.model.fork', forkEvent, e);
        return deps.ports.models.fork({
          prompt: sentBlocks(p.prompt, p.promptBlocks),
          signal: deps.signal,
        });
      });
    },
    // Judgment: the docs name `classify` and no argument; it takes one object and the host answers.
    classify: async (...args) => {
      const input = args[0];
      if (!isRecord(input)) throw new Error('$.model.classify: takes one object');
      return call(deps, 'model.classify', input, (e) =>
        deps.ports.models.classify(isRecord(e) ? e : {}, deps.signal),
      );
    },
  };
}
