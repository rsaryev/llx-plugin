import type { ThemeColor } from './theme.ts';
import { ANSI_COLOR_NAMES, type AnsiColorName } from './theme-tokens.ts';

/**
 * A theme colour as CSS (judgment: the docs give the forms of a colour, not what a host that draws
 * with CSS makes of them). `rgb` is exact. `ansi256` and `ansi:<name>` are palette references: "the
 * terminal's own colours", so no colour is fixed by the theme; the kit's default palette is xterm's.
 */

/** The 16 ANSI colours as `#rrggbb`, by name: what a terminal draws for `ansi:<name>`. */
export type AnsiPalette = Readonly<Record<AnsiColorName, string>>;

/** xterm's default 16 colours: the eight, then their `Bright` forms. */
export const XTERM_ANSI_PALETTE: AnsiPalette = {
  black: '#000000',
  red: '#cd0000',
  green: '#00cd00',
  yellow: '#cdcd00',
  blue: '#0000ee',
  magenta: '#cd00cd',
  cyan: '#00cdcd',
  white: '#e5e5e5',
  blackBright: '#7f7f7f',
  redBright: '#ff0000',
  greenBright: '#00ff00',
  yellowBright: '#ffff00',
  blueBright: '#5c5cff',
  magentaBright: '#ff00ff',
  cyanBright: '#00ffff',
  whiteBright: '#ffffff',
};

const hex = (channel: number): string => channel.toString(16).padStart(2, '0');
const toHex = (r: number, g: number, b: number): string => `#${hex(r)}${hex(g)}${hex(b)}`;

/** The six levels of each channel of the 6x6x6 colour cube (indexes 16 to 231), as xterm draws them. */
const CUBE_LEVELS = [0, 95, 135, 175, 215, 255] as const;
const CUBE_START = 16;
const GRAY_START = 232;

function ansi256Hex(index: number, palette: AnsiPalette): string {
  const named = ANSI_COLOR_NAMES[index];
  if (named !== undefined) return palette[named];
  if (index >= GRAY_START) {
    const level = 8 + (index - GRAY_START) * 10;
    return toHex(level, level, level);
  }
  const cube = index - CUBE_START;
  const level = (at: number): number => CUBE_LEVELS[at % 6] ?? 0;
  return toHex(level(Math.floor(cube / 36)), level(Math.floor(cube / 6)), level(cube));
}

/**
 * The colour as `#rrggbb`. `rgb` is itself; `ansi:<name>` is read from `palette`; `ansi256(n)` is the
 * palette for 0 to 15, xterm's 6x6x6 cube for 16 to 231 and its grey ramp for 232 to 255.
 */
export function themeColorToHex(
  color: ThemeColor,
  palette: AnsiPalette = XTERM_ANSI_PALETTE,
): string {
  if (color.form === 'rgb') return toHex(color.r, color.g, color.b);
  return color.form === 'ansi' ? palette[color.name] : ansi256Hex(color.index, palette);
}
