import { PLUGIN_ONLY_SURFACES, type PluginOnlySurface } from '../../protocol/settings-keys.ts';

/** The kinds of customization the lock covers, and how many names in the list were no kind. */
export interface SurfaceLocks {
  readonly locked: ReadonlySet<PluginOnlySurface>;
  /** Names this version does not recognize: they lock nothing, and a status note counts them. */
  readonly unknownNames: number;
}

const ALL: ReadonlySet<PluginOnlySurface> = new Set(PLUGIN_ONLY_SURFACES);

const locks = (locked: ReadonlySet<PluginOnlySurface>, unknownNames = 0): SurfaceLocks => ({
  locked,
  unknownNames,
});

const surfaceNamed = (name: unknown): PluginOnlySurface | undefined =>
  PLUGIN_ONLY_SURFACES.find((surface) => surface === name);

function fromList(names: readonly unknown[]): SurfaceLocks {
  const known = names.flatMap((name) => surfaceNamed(name) ?? []);
  return locks(new Set(known), names.length - known.length);
}

/**
 * What the value of `strictPluginOnlyCustomization` locks (settings-reference.md,
 * `strictPluginOnlyCustomization`): `true` locks all four kinds, an array locks the kinds it names,
 * and anything unset locks nothing. A name no kind has "locks nothing; a status note counts such
 * entries" (managed-settings.md, "Invalid entries in managed settings"), the same page that treats a
 * value "neither a boolean nor an array" as `true`. `false` is the SDK type's "explicit no-op"
 * (spec/judgments.md).
 */
export function readSurfaceLocks(value: unknown): SurfaceLocks {
  if (value === undefined || value === null || value === false) return locks(new Set());
  if (Array.isArray(value)) return fromList(value);
  return locks(ALL);
}
