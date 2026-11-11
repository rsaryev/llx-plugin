/**
 * The forms of a `model` value (sub-agents.md, "Choose a model"): "Model alias: use one of the
 * available aliases: `sonnet`, `opus`, `haiku`, or `fable`", "Full model ID ... Accepts the same
 * values as the `--model` flag", and "inherit: use the same model as the main conversation". Shared
 * by the model order (`launch-model.ts`) and the writers and allowlist (`model-choice.ts`).
 */

import { modelIdNames } from '../format/model-id.ts';

/** The family aliases an Agent tool call's `model` parameter takes. */
export const MODEL_ALIASES = ['sonnet', 'opus', 'haiku', 'fable'] as const;
export type ModelAlias = (typeof MODEL_ALIASES)[number];

/**
 * The family alias of a model: the alias itself, or the one a model ID embeds (`claude-opus-5-5`,
 * `claude-opus-5-5[1m]` and `my-gateway/claude-opus-5-5` are `opus`), read as `availableModels`
 * reads a family entry (model-config.md, "Add a custom model option": "A custom ID that embeds a
 * family name ... counts as a specific entry for that family"). `undefined` when it embeds none, as
 * an inference profile ARN Claude Code "hasn't resolved to a backing model" (sub-agents.md, "Choose
 * a model"): the `mainFamily` of `resolveSubagentModel` is then left out.
 */
export const modelFamily = (model: string): ModelAlias | undefined =>
  MODEL_ALIASES.find((alias) => modelIdNames(model, alias));

/** The three forms the frontmatter `model` field takes. */
export type ModelValueKind = 'alias' | 'full-id' | 'inherit';

export const isModelAlias = (value: string | undefined): value is ModelAlias =>
  MODEL_ALIASES.some((alias) => alias === value);

/**
 * Which form a `model` value is: one of the aliases `sonnet`, `opus`, `haiku`, `fable`; `inherit`; or
 * anything else, a full model ID that "accepts the same values as the `--model` flag" (so the kit
 * does not judge whether such an ID exists).
 */
export function modelValueKind(value: string): ModelValueKind {
  const text = value.trim();
  if (text === 'inherit') return 'inherit';
  return isModelAlias(text) ? 'alias' : 'full-id';
}
