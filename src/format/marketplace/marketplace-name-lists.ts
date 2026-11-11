/**
 * The names the docs print (plugins/marketplace-reference.md, "Reserved names"): one list per
 * group, in the docs' order. The checks that use them are `marketplace-names.ts`.
 */

export const OFFICIAL_NAMES = [
  'claude-code-marketplace',
  'claude-code-plugins',
  'claude-plugins-official',
  'anthropic-marketplace',
  'anthropic-plugins',
  'agent-skills',
  'anthropic-agent-skills',
  'life-sciences',
  'knowledge-work-plugins',
  'claude-for-legal',
  'claude-for-financial-services',
  'financial-services-plugins',
  'first-party-plugins',
  'claude-tag-plugins',
] as const;
/**
 * The official names whose auto-update default is off, though they are official: "on for
 * Anthropic's official marketplaces such as `claude-plugins-official`, off for
 * `knowledge-work-plugins` and `first-party-plugins`" (plugins/loading.md, "Which marketplaces and
 * plugins auto-update", item 3). The one list: the registry's plan and the update pass read it.
 */
export const OFFICIAL_BUT_OFF = ['knowledge-work-plugins', 'first-party-plugins'] as const;

/** Whether `name` is one of `OFFICIAL_BUT_OFF`. */
export const isOfficialButOff = (name: string): boolean =>
  OFFICIAL_BUT_OFF.some((off) => off === name);

export const COMMUNITY_NAMES = [
  'claude-community',
  'claude-plugins-community',
  'healthcare',
] as const;
export const DIRECTORY_NAMES = ['anthropic-plugin-directory', 'claude-plugin-directory'] as const;

/** The three lists whose names the `anthropics` organization on GitHub may use. */
export const OFFICIAL_LISTS: ReadonlySet<string> = new Set([
  ...OFFICIAL_NAMES,
  ...COMMUNITY_NAMES,
  ...DIRECTORY_NAMES,
]);

/** Names Claude Code gives plugins that come from no marketplace, and what each one means. */
export const NON_MARKETPLACE_NAMES: ReadonlyMap<string, string> = new Map([
  ['inline', 'is reserved for --plugin-dir session plugins'],
  ['builtin', 'is reserved for built-in plugins'],
  ['skills-dir', 'is reserved for plugins auto-loaded from .claude/skills/'],
  ['synced', 'is reserved for plugins synced from your claude.ai account'],
  ['claude-plugin-test', 'is reserved for plugin tests'],
]);

/** Reserved "in any casing" (requires Claude Code v2.1.275 or later). */
export const ANY_CASING_NAMES: ReadonlySet<string> = new Set([
  'npm',
  'pip',
  'uv',
  'cargo',
  'github',
  'gh',
]);

/** Member names every JavaScript object has (requires Claude Code v2.1.296 or later). */
export const OBJECT_MEMBER_NAMES: ReadonlySet<string> = new Set([
  'constructor',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toLocaleString',
  'toString',
  'valueOf',
]);
