import { toJsonValue, type JsonObject, type JsonValue } from '../../foundation/index.ts';
import { ENGINE_ORIGIN } from '../../protocol/mods-events.ts';
import { sameData } from '../events/spec.ts';
import type { HookReport, ModChain } from '../types.ts';
import { isRecord } from './call.ts';
import type { ModSettingsReader } from './ports.ts';

/** What Claude Code's own `settings.read` needs. */
export interface EngineReadOptions {
  readonly chain: ModChain;
  readonly settings: ModSettingsReader;
  /** Whether `value` is one `key` can hold, by the key's schema in the settings reference. */
  readonly fits: (key: string, value: unknown) => boolean;
  readonly signal: AbortSignal;
  readonly report: (report: HookReport) => void;
  /** The debug log. */
  readonly debug: (line: string) => void;
}

/** The lines of the debug log (troubleshoot.md, "`the answer for <key> is no value the key can hold`", "`settings.read: refused to the engine`"). */
const refusedLine = (reason: string): string =>
  `settings.read: refused to the engine (engine: $.settings.read: ${reason}); the settings' own values stand`;
const noValueLine = (key: string): string =>
  `settings.read: the answer for ${key} is no value the key can hold; the settings' own value stands`;

/**
 * The settings the session keeps after the hooks answered (events.md, "What a `settings.read` hook
 * can return"): for each key a hook changed, its whole value replaces the merged one when it fits the
 * key's schema; a key it left out is unset; a value that does not fit leaves that key as merged.
 */
function applyAnswer(
  merged: JsonObject,
  value: Readonly<Record<string, unknown>>,
  options: EngineReadOptions,
): JsonObject {
  const kept: Record<string, JsonValue> = {};
  for (const [key, answered] of Object.entries(value)) {
    // Judgment: settings are JSON, so an answer JSON cannot write leaves the key as merged.
    const json = toJsonValue(answered);
    if (json !== undefined && (sameData(answered, merged[key]) || options.fits(key, answered))) {
      kept[key] = json;
      continue;
    }
    options.debug(noValueLine(key));
    const was = merged[key];
    if (was !== undefined) kept[key] = was;
  }
  return kept;
}

/**
 * Claude Code's own read of the session's merged settings: the `settings.read` event with
 * `next.origin` `{ plugin: 'engine', tier: 'core' }`, `e.layers` holding every layer, and no
 * `e.source`. A `{ deny }` keeps the settings as merged before any hook answered.
 */
export async function readEngineSettings(options: EngineReadOptions): Promise<JsonObject> {
  const layers = await options.settings.layers();
  const merged = options.settings.merged(layers);
  const answer = await options.chain.dispatch(
    'settings.read',
    { layers: structuredClone(layers) },
    {
      origin: ENGINE_ORIGIN,
      signal: options.signal,
      report: options.report,
      core: () => Promise.resolve({ value: merged }),
    },
  );
  if (!isRecord(answer)) return merged;
  if (typeof answer.deny === 'string') {
    options.debug(refusedLine(answer.deny));
    return merged;
  }
  return isRecord(answer.value) ? applyAnswer(merged, answer.value, options) : merged;
}
