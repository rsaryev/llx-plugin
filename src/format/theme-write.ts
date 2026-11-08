import type { Theme, ThemeColor } from './theme.ts';

/** Writing a theme file back (plugins/components.md, "Themes and output styles": a plugin theme's edit is saved as a copy). */

const hex = (channel: number): string => channel.toString(16).padStart(2, '0');

/** A colour written the way a theme file takes it: `#rrggbb`, `ansi256(n)` or `ansi:<name>`. */
export function formatThemeColor(color: ThemeColor): string {
  if (color.form === 'rgb') return `#${hex(color.r)}${hex(color.g)}${hex(color.b)}`;
  return color.form === 'ansi256' ? `ansi256(${color.index})` : `ansi:${color.name}`;
}

/** The file text of a theme: `name`, `base` and `overrides`, two-space JSON. */
export function themeFileText(theme: Theme): string {
  const overrides = Object.fromEntries(
    Object.entries(theme.overrides).map(([token, color]) => [token, formatThemeColor(color)]),
  );
  return `${JSON.stringify({ name: theme.name, base: theme.base, overrides }, null, 2)}\n`;
}

export interface ThemeCopy {
  /** The slug the copy is saved under in the user's own themes directory (`~/.claude/themes/<slug>.json`). */
  readonly slug: string;
  readonly text: string;
}
/**
 * "Plugin themes are read-only, so when a user edits one in `/theme`, the edit is saved as a copy in
 * their own themes directory" (plugins/components.md, "Themes and output styles"). The copy keeps the
 * plugin theme's slug unless the user already has a theme under it, then `<slug>-copy`, `<slug>-copy-2`
 * and so on (spec/judgments.md: the docs do not name the copy).
 */
export function copyOfPluginTheme(edited: Theme, taken: ReadonlySet<string>): ThemeCopy {
  const candidate = (n: number): string =>
    n === 0 ? edited.slug : n === 1 ? `${edited.slug}-copy` : `${edited.slug}-copy-${n}`;
  let attempt = 0;
  while (taken.has(candidate(attempt))) attempt++;
  const slug = candidate(attempt);
  return { slug, text: themeFileText({ ...edited, slug }) };
}
