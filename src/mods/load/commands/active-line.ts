/**
 * The line `/plugin` shows under its tabs (plugins/mods/overview.md, "See which mods a session
 * loaded"; reference.md, "Commands"): `1 mod active · first-mod`, when a mod that is not built in has
 * loaded. Judgment: the docs show one mod; several are `2 mods active · a, b`, in the order they run.
 */
export function activeModsLine(
  mods: readonly { readonly name: string; readonly isBuiltin: boolean }[],
): string | undefined {
  const names = mods.filter((mod) => !mod.isBuiltin).map((mod) => mod.name);
  if (names.length === 0) return undefined;
  return `${names.length} ${names.length === 1 ? 'mod' : 'mods'} active · ${names.join(', ')}`;
}
