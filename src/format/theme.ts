import { error, warning, type PluginIssue } from './issues.ts';
import {
  ANSI_COLOR_NAMES,
  DEFAULT_THEME_BASE,
  THEME_BASES,
  THEME_TOKEN_NAMES,
  type AnsiColorName,
  type ThemeBase,
} from './theme-tokens.ts';
import { isRecord } from '../protocol/is-record.ts';

/**
 * A custom theme file (terminal-config.md, "Create a custom theme"): `~/.claude/themes/<slug>.json`,
 * and `themes/<slug>.json` in a plugin (plugins/components.md, "Themes and output styles"). Three
 * optional fields: `name`, `base` and `overrides`.
 */

/** A theme colour, as written: terminal palettes stay palette references (`ansi:` follows the terminal's own colours). */
export type ThemeColor =
  | { readonly form: 'rgb'; readonly r: number; readonly g: number; readonly b: number }
  | { readonly form: 'ansi256'; readonly index: number }
  | { readonly form: 'ansi'; readonly name: AnsiColorName };

const TOKENS: ReadonlySet<string> = new Set(THEME_TOKEN_NAMES);
const ANSI_NAMES: ReadonlySet<string> = new Set(ANSI_COLOR_NAMES);
const isAnsiName = (name: string): name is AnsiColorName => ANSI_NAMES.has(name);

export interface Theme {
  /** The file name without `.json`. */
  readonly slug: string;
  /** The label `/theme` shows: `name`, else the slug. */
  readonly name: string;
  readonly base: ThemeBase;
  /** The tokens set to a valid colour; every token not here falls through to the base preset. */
  readonly overrides: Readonly<Record<string, ThemeColor>>;
  /** Names in `overrides` that are not a documented token: ignored, in file order. */
  readonly unknownTokens: readonly string[];
  /**
   * Those entries as written, name to raw value. `/theme` sets "a few single-purpose accents such as
   * onboarding screen colors" that the reference omits: a copy or a rewrite writes them back
   * (judgment), so no valid token is lost.
   */
  readonly extraOverrides: Readonly<Record<string, unknown>>;
}

export interface ThemeRead {
  /** `undefined` when the file is not a JSON object. */
  readonly theme: Theme | undefined;
  readonly issues: readonly PluginIssue[];
}

/** The slug of a theme file: its name without `.json`; both `/` and `\` separate a path. */
export function themeSlug(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? path;
  return base.replace(/\.json$/i, '');
}

/**
 * What `/theme` stores as the preference when the theme is selected: `custom:<slug>` for a theme of
 * `~/.claude/themes/`, `custom:<plugin-name>:<slug>` for one a plugin ships (settings-reference.md,
 * `theme`).
 */
export const customThemeId = (slug: string, plugin?: string): string =>
  plugin === undefined ? `custom:${slug}` : `custom:${plugin}:${slug}`;

const channel = (text: string | undefined): number => Number(text);
const hexPair = (text: string): number => Number.parseInt(text, 16);

type ColorParser = (text: string) => ThemeColor | undefined;

/** One parser per form the docs list. Whitespace is allowed inside the parentheses (judgment). */
const COLOR_FORMS: readonly ColorParser[] = [
  (text) => {
    const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(text);
    return hex
      ? {
          form: 'rgb',
          r: hexPair(hex[1] ?? ''),
          g: hexPair(hex[2] ?? ''),
          b: hexPair(hex[3] ?? ''),
        }
      : undefined;
  },
  (text) => {
    const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(text);
    const double = (digit: string | undefined): number => hexPair(`${digit}${digit}`);
    return short
      ? { form: 'rgb', r: double(short[1]), g: double(short[2]), b: double(short[3]) }
      : undefined;
  },
  (text) => {
    const call = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/.exec(text);
    const parts = call ? [call[1], call[2], call[3]].map(channel) : [];
    return parts.length === 3 && parts.every((part) => part <= 255)
      ? { form: 'rgb', r: parts[0] ?? 0, g: parts[1] ?? 0, b: parts[2] ?? 0 }
      : undefined;
  },
  (text) => {
    const call = /^ansi256\(\s*(\d{1,3})\s*\)$/.exec(text);
    const index = channel(call?.[1]);
    return call && index <= 255 ? { form: 'ansi256', index } : undefined;
  },
  (text) => {
    const named = /^ansi:(\w+)$/.exec(text)?.[1];
    return named !== undefined && isAnsiName(named) ? { form: 'ansi', name: named } : undefined;
  },
];

/** A colour value as the docs accept it, or `undefined`: `#rrggbb`, `#rgb`, `rgb(r,g,b)`, `ansi256(n)`, `ansi:<name>`. */
export function readThemeColor(value: unknown): ThemeColor | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  for (const form of COLOR_FORMS) {
    const color = form(text);
    if (color) return color;
  }
  return undefined;
}

const isBase = (value: unknown): value is ThemeBase => THEME_BASES.some((each) => each === value);

interface Overrides {
  readonly overrides: Readonly<Record<string, ThemeColor>>;
  readonly extra: Readonly<Record<string, unknown>>;
  readonly issues: readonly PluginIssue[];
}

/** Keeps the documented tokens with a valid colour; every other entry is ignored, as the docs say. */
function readOverrides(raw: unknown): Overrides {
  if (raw === undefined) return { overrides: {}, extra: {}, issues: [] };
  if (!isRecord(raw)) {
    const issue = warning(
      'overrides',
      'overrides must be an object of token names to colors; ignored',
    );
    return { overrides: {}, extra: {}, issues: [issue] };
  }
  const kept: [string, ThemeColor][] = [];
  const extra: [string, unknown][] = [];
  const issues: PluginIssue[] = [];
  for (const [token, value] of Object.entries(raw)) {
    if (!TOKENS.has(token)) {
      extra.push([token, value]);
      continue;
    }
    const color = readThemeColor(value);
    if (color) kept.push([token, color]);
    else
      issues.push(
        warning(`overrides.${token}`, `${token} is not a color Claude Code accepts; ignored`),
      );
  }
  return { overrides: Object.fromEntries(kept), extra: Object.fromEntries(extra), issues };
}

function parseObject(text: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(text);
    return isRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Read a theme file. Never throws. `name` defaults to the slug, `base` to `dark`; an invalid colour
 * and an unknown token are ignored, "so a typo cannot break rendering". What the docs leave open is in
 * spec/judgments.md: a base that is not a preset falls back to `dark` with a warning, an invalid colour
 * is a warning, and a file that is not a JSON object is not a theme (one error).
 */
export function readTheme(slug: string, text: string): ThemeRead {
  const raw = parseObject(text);
  if (raw === undefined) {
    return { theme: undefined, issues: [error('theme', `${slug}.json is not a JSON object`)] };
  }
  const issues: PluginIssue[] = [];
  const base = isBase(raw.base) ? raw.base : DEFAULT_THEME_BASE;
  if (raw.base !== undefined && !isBase(raw.base)) {
    issues.push(
      warning('base', `base must be one of ${THEME_BASES.join(', ')}; using ${DEFAULT_THEME_BASE}`),
    );
  }
  const label = typeof raw.name === 'string' ? raw.name.trim() : '';
  const read = readOverrides(raw.overrides);
  const theme: Theme = {
    slug,
    name: label === '' ? slug : label,
    base,
    overrides: read.overrides,
    unknownTokens: Object.keys(read.extra),
    extraOverrides: read.extra,
  };
  return { theme, issues: [...issues, ...read.issues] };
}
