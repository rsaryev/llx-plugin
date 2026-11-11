import type { EffortLevel } from '../../protocol/official.ts';
import {
  EFFORT_LEVELS,
  SAVED_EFFORT_LEVELS,
  type SavedEffortLevel,
} from '../../protocol/effort.ts';
import { admits } from '../key-spec.ts';
import { LOWEST_CAP, strictestOf } from './exceptions.ts';
import { orderedLayers, type PolicyLayer, type PolicyScope } from '../layers.ts';
import { isRecord } from '../../protocol/is-record.ts';

/**
 * The effort level a settings file saves for one model (settings-reference.md, `modelSettings` and
 * `effortLevel`): "A model's `effortLevel` here takes precedence over the top-level `effortLevel` in
 * the same settings file. Across files, Claude Code resolves each model separately: the
 * highest-precedence settings file that sets either an `effortLevel` for that model or a top-level
 * `effortLevel` that applies to that model decides". `modelSettings` is so no merged object: the
 * entry of a model in a lower file is never combined with a higher file's. A file saves only the
 * levels `SAVED_EFFORT_LEVELS` lists: `max` is valid for `maxEffortLevel` alone.
 */
export interface ModelEffort {
  readonly level: SavedEffortLevel;
  readonly from: PolicyScope;
}

export interface ModelEffortFacts {
  /** The model's canonical name (`claude-opus-5-5`): the host maps the alias, dated, `[1m]` and provider spellings to it. */
  readonly model: string;
  /**
   * The top-level `effortLevel` of the user file applies to this model: in user settings it "keeps
   * applying where it applied before, on Opus 5, Fable 5.1, and earlier models"; in the other files
   * it applies to every model. Which models are "earlier" is the host's to say.
   */
  readonly userLevelApplies: boolean;
}

const isSavedLevel = (value: unknown): value is SavedEffortLevel =>
  SAVED_EFFORT_LEVELS.some((level) => level === value);

const effortOf = (settings: unknown): SavedEffortLevel | undefined =>
  isRecord(settings) && isSavedLevel(settings.effortLevel) ? settings.effortLevel : undefined;

const modelEntry = (layer: PolicyLayer, model: string): unknown => {
  const { modelSettings } = layer.settings;
  return isRecord(modelSettings) ? modelSettings[model] : undefined;
};

/** What one file says about the model: its saved level, else the top-level one where that applies. */
function fileLevel(layer: PolicyLayer, facts: ModelEffortFacts): SavedEffortLevel | undefined {
  const saved = effortOf(modelEntry(layer, facts.model));
  if (saved !== undefined) return saved;
  const topLevelApplies = layer.scope !== 'user' || facts.userLevelApplies;
  return topLevelApplies ? effortOf(layer.settings) : undefined;
}

/** The level the files give a model, or `undefined` when none does. */
export function effortLevelFor(
  layers: readonly PolicyLayer[],
  facts: ModelEffortFacts,
): ModelEffort | undefined {
  for (const layer of orderedLayers(layers)) {
    const level = fileLevel(layer, facts);
    if (level !== undefined) return { level, from: layer.scope };
  }
  return undefined;
}

const isLevel = (value: unknown): value is EffortLevel =>
  EFFORT_LEVELS.some((level) => level === value);

const rankOf = (level: EffortLevel): number => EFFORT_LEVELS.indexOf(level);

/**
 * The cap one file sets for a model (settings-reference.md, `maxEffortLevel`, "Per-model caps"): the
 * model's own `maxEffortLevel` "replaces this key for the model only within the settings source that
 * sets both", so it stands in for the file's top-level cap, `"max"` among them (no cap).
 */
function fileCap(layer: PolicyLayer, model: string): EffortLevel | undefined {
  const entry = modelEntry(layer, model);
  const own = isRecord(entry) ? entry.maxEffortLevel : undefined;
  const cap = isLevel(own) ? own : layer.settings.maxEffortLevel;
  return isLevel(cap) && admits('maxEffortLevel', layer.scope, cap) ? cap : undefined;
}

/**
 * The cap that applies to a model: "When several scopes set a cap, the lowest applies, so a cap set
 * in one scope can't be raised from another", and a file's `"max"` exempts the model from that
 * file's cap only, "Claude Code still applies caps from other sources". `undefined` when no file
 * caps the model (a `"max"` sets no cap). An organization's own effort limit for a model is not in
 * the files: the host takes the lower of the two with `capEffort`.
 */
export function effectiveCap(
  layers: readonly PolicyLayer[],
  model: string,
): Exclude<EffortLevel, 'max'> | undefined {
  const caps = layers.flatMap((layer) => fileCap(layer, model) ?? []);
  const lowest = strictestOf(LOWEST_CAP.ladder, caps);
  return lowest === 'max' ? undefined : lowest;
}

/** The level a session runs at: `level`, or the cap when `level` is higher ("Any higher level runs at the cap instead"). */
export function capEffort(level: EffortLevel, cap: EffortLevel | undefined): EffortLevel {
  return cap !== undefined && rankOf(level) > rankOf(cap) ? cap : level;
}
