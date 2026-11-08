import type { EffortLevel } from '../../protocol/official.ts';
import { orderedLayers, type PolicyLayer, type PolicyScope } from '../layers.ts';
import { isRecord } from '../record.ts';

/**
 * The effort level a settings file saves for one model (settings-reference.md, `modelSettings` and
 * `effortLevel`): "A model's `effortLevel` here takes precedence over the top-level `effortLevel` in
 * the same settings file. Across files, Claude Code resolves each model separately: the
 * highest-precedence settings file that sets either an `effortLevel` for that model or a top-level
 * `effortLevel` that applies to that model decides". `modelSettings` is so no merged object: the
 * entry of a model in a lower file is never combined with a higher file's.
 */
export interface ModelEffort {
  readonly level: EffortLevel;
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

const LEVELS: readonly string[] = ['low', 'medium', 'high', 'xhigh', 'max'];
const isLevel = (value: unknown): value is EffortLevel => LEVELS.includes(String(value));

const effortOf = (settings: unknown): EffortLevel | undefined =>
  isRecord(settings) && isLevel(settings.effortLevel) ? settings.effortLevel : undefined;

/** What one file says about the model: its saved level, else the top-level one where that applies. */
function fileLevel(layer: PolicyLayer, facts: ModelEffortFacts): EffortLevel | undefined {
  const { modelSettings } = layer.settings;
  const saved = isRecord(modelSettings) ? effortOf(modelSettings[facts.model]) : undefined;
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
