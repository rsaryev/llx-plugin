import { z } from 'zod';
import type { JsonObject } from '../../foundation/index.ts';
import type { ModsNamespaceApi } from '../types.ts';
import { call, isRecord, parse, type Deps } from './call.ts';

/** `$.settings.read({ source, key })`: both are optional (api.md, "Read all settings, one source, or one key"). */
const options = z
  .looseObject({ source: z.string().optional(), key: z.string().optional() })
  .default({});

/**
 * The sources `source` can name. `plugin` is a layer name only, "not a `source` you can pass to
 * `$.settings.read`" (events.md, "What a `settings.read` hook receives").
 */
const SOURCES = ['user', 'project', 'local', 'flag', 'policy'] as const;
const isSource = (name: string): boolean => SOURCES.some((source) => source === name);

const event = z.looseObject({
  layers: z.array(z.looseObject({ source: z.string(), settings: z.record(z.string(), z.json()) })),
  source: z.string().optional(),
});

/**
 * What a mod's read gives `next(e)` when no hook answers: the merged settings, or the one source's
 * settings, `{}` when that source holds none.
 */
function valueOfRead(deps: Deps, e: unknown): JsonObject {
  const { layers, source } = parse('$.settings.read', event, e);
  const { settings } = deps.ports;
  if (source === undefined) return settings.merged(layers);
  return layers.find((layer) => layer.source === source)?.settings ?? {};
}

/**
 * A hook's `{ value }` on a mod's read: the call resolves to the value, or to the `key` taken from it
 * ("so return a whole object and not an array": a key cannot be taken from anything else, so a
 * value that is not an object gives the key no value, judgment).
 */
const keyOf = (value: unknown, key: string | undefined): unknown => {
  if (key === undefined) return value;
  return isRecord(value) ? value[key] : undefined;
};

export function settingsApi(deps: Deps): ModsNamespaceApi<'settings'> {
  return {
    read: async (...args) => {
      const { source, key } = parse('$.settings.read', options, args[0]);
      if (source !== undefined && !isSource(source)) {
        throw new Error(
          `$.settings.read: "${source}" is not a settings source: use ${SOURCES.join(', ')}`,
        );
      }
      const all = await deps.ports.settings.layers();
      const layers = source === undefined ? all : all.filter((layer) => layer.source === source);
      const answered = await call(
        deps,
        'settings.read',
        { layers: structuredClone(layers), ...(source === undefined ? {} : { source }) },
        (e) => Promise.resolve(valueOfRead(deps, e)),
      );
      return keyOf(answered, key);
    },
  };
}
