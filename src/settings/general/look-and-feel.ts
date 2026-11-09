import type { PolicyView } from '../view.ts';

/**
 * The interface keys that pick one value from a closed set: `theme` (settings-reference.md, `theme`;
 * terminal-config.md, "Create a custom theme") and `teammateMode` (`teammateMode`), plus `outputStyle`.
 * Each reads the highest file's value; a value Claude Code does not recognize never reaches the layer
 * (the read drops it with a warning), so the next lower file or the default applies.
 */
export const THEME_PRESETS = [
  'auto',
  'dark',
  'light',
  'dark-daltonized',
  'light-daltonized',
  'dark-ansi',
  'light-ansi',
] as const;
export type ThemePreset = (typeof THEME_PRESETS)[number];

/** The theme a session shows: a preset, or a custom one of `~/.claude/themes/` or of a plugin. */
export type ThemeChoice =
  | { readonly preset: ThemePreset }
  | { readonly custom: { readonly slug: string; readonly plugin?: string } };

const DEFAULT_THEME: ThemeChoice = { preset: 'dark' };

const isPreset = (value: string): value is ThemePreset =>
  THEME_PRESETS.some((preset) => preset === value);

/**
 * `"custom:<slug>"` or `"custom:<plugin-name>:<slug>"`; `undefined` for any other text. A slug is the
 * file name without `.json`, so it is never empty (the docs name no further rule).
 */
export function parseTheme(value: string): ThemeChoice | undefined {
  if (isPreset(value)) return { preset: value };
  const [prefix, ...parts] = value.split(':');
  if (prefix !== 'custom' || parts.length < 1 || parts.length > 2 || parts.includes('')) {
    return undefined;
  }
  const [first, second] = parts;
  if (first === undefined) return undefined;
  return second === undefined
    ? { custom: { slug: first } }
    : { custom: { plugin: first, slug: second } };
}

/**
 * The theme: the highest file that sets it, else `legacy` (a value "in `~/.claude.json` from an older
 * version applies when no settings file sets it"), else `"dark"`.
 */
export function readThemeSetting(view: PolicyView, legacy?: string): ThemeChoice {
  const set = view.get('theme');
  if (set !== undefined) return parseTheme(set) ?? DEFAULT_THEME;
  return (legacy === undefined ? undefined : parseTheme(legacy)) ?? DEFAULT_THEME;
}

export const TEAMMATE_MODES = ['in-process', 'auto', 'tmux', 'iterm2'] as const;
export type TeammateMode = (typeof TEAMMATE_MODES)[number];

const isTeammateMode = (value: string | undefined): value is TeammateMode =>
  TEAMMATE_MODES.some((mode) => mode === value);

/** The teammate display mode: a file's value, else `legacy` from `~/.claude.json`, else `"in-process"`. */
export function readTeammateMode(view: PolicyView, legacy?: string): TeammateMode {
  const set = view.get('teammateMode');
  if (set !== undefined) return set;
  return isTeammateMode(legacy) ? legacy : 'in-process';
}

/** The output style named by the highest file; `undefined` selects the default style. */
export const readOutputStyleSetting = (view: PolicyView): string | undefined =>
  view.get('outputStyle');
