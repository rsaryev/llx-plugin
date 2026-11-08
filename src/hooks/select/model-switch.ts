import type { ModelCatalog } from '../contracts.ts';

/** hooks.md, "PreModelSwitch": the matcher ignores "any `[1m]` suffix". */
const LONG_CONTEXT_SUFFIX = /\[1m\]$/;

const withoutSuffix = (model: string): string => model.replace(LONG_CONTEXT_SUFFIX, '');

/**
 * The canonical name of the model a switch goes to, which `PreModelSwitch` and `PostModelSwitch`
 * matchers compare against: an alias, a dated id and a provider id all resolve to the one name
 * (the catalog's job, the kit holds no model list). `undefined` when no canonical name can be
 * determined, so every hook of the event runs, whatever its matcher.
 */
export function canonicalMatcherModel(toModel: string, catalog?: ModelCatalog): string | undefined {
  const canonical = catalog?.canonicalModel(withoutSuffix(toModel));
  return canonical === undefined ? undefined : withoutSuffix(canonical);
}
