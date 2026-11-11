/**
 * Whether a model ID names a model name, family alias or version prefix: the name is the whole ID,
 * a prefix of it, or starts one of its dash-separated parts (`opus` in `claude-opus-5-5` and in
 * `my-gateway/claude-opus-5-5`). One reading for `availableModels` entries ("`opus` allows any opus
 * version", "a custom ID that embeds a family name ... counts as a specific entry for that family")
 * and for the family of a model ID (model-config.md, "Restrict model selection", "Add a custom
 * model option"). Judgment where the docs give only examples (spec/judgments.md).
 */
export function modelIdNames(model: string, name: string): boolean {
  const id = model.trim().toLowerCase();
  const named = name.trim().toLowerCase();
  return named !== '' && (id.startsWith(named) || id.includes(`-${named}`));
}
