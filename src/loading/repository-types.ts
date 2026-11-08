/**
 * What stops skills-directory plugins in managed settings (plugins/loading.md, "Skills-directory
 * plugins blocked by managed settings"). The names match the settings stream's `SkillsDirVerdict.by`,
 * so a host passes that value through; `loading` and `settings` are one layer and import neither.
 */
export type SkillsDirBlock =
  | 'strictPluginOnlyCustomization'
  | 'strictKnownMarketplaces'
  | 'blockedMarketplaces';
