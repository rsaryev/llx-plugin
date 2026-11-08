/**
 * terminal-config.md § Create a custom theme: what the docs leave open about a theme file (a file that
 * is not an object, unrecognized fields, the SDK's preset list, the edges of the colour grammar), the
 * kit's judgments (spec/judgments.md), tested outside spec().
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { readTheme, readThemeColor } from '../../src/format/theme.ts';
import {
  XTERM_ANSI_PALETTE,
  themeColorToHex,
  type AnsiPalette,
} from '../../src/format/theme-color.ts';
import { THEME_BASES } from '../../src/format/theme-tokens.ts';
import { json } from '../support/plugin-folder.ts';

const byName = (a: string | undefined, b: string | undefined) => (a ?? '').localeCompare(b ?? '');
const rgb = (r: number, g: number, b: number) => ({ form: 'rgb', r, g, b }) as const;

describe('a theme file (judgments)', () => {
  test('JSON that does not parse, or is not an object, is not a theme: one error, no theme', () => {
    for (const text of ['', '{', '[]', '"dark"', 'null', '3']) {
      const { theme, issues } = readTheme('t', text);
      expect(theme).toBeUndefined();
      expect(issues.map((found) => found.severity)).toEqual(['error']);
    }
  });

  test('unrecognized fields are ignored without an issue', () => {
    const { theme, issues } = readTheme('t', json({ name: 'N', colors: {}, version: 2 }));
    expect(theme?.name).toBe('N');
    expect(issues).toEqual([]);
  });

  test('an unlisted token keeps its raw value in extraOverrides, in file order, whatever its type', () => {
    const { theme } = readTheme('t', json({ overrides: { zed: '#fff', error: '#f00', alpha: 3 } }));
    expect(theme?.extraOverrides).toEqual({ zed: '#fff', alpha: 3 });
    expect(theme?.unknownTokens).toEqual(['zed', 'alpha']);
  });

  test('the presets are the ones of the SDK settings type (theme), less auto', () => {
    const types = readFileSync('node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts', 'utf8');
    const line = /theme\?: \(([^)]*)\)/.exec(types)?.[1] ?? '';
    const sdk = [...line.matchAll(/'([^']+)'/g)].map((found) => found[1]);
    expect(sdk).toContain('auto');
    expect(sdk.filter((name) => name !== 'auto').toSorted(byName)).toEqual(
      [...THEME_BASES].toSorted(byName),
    );
  });

  test('the colour grammar: names and forms are exact, spaces only around the numbers', () => {
    const at = (value: string) =>
      readTheme('t', json({ overrides: { text: value } })).theme?.overrides;
    expect(at('rgb( 1 , 2 , 3 )')).toEqual({ text: rgb(1, 2, 3) });
    expect(at(' #fff ')).toEqual({ text: rgb(255, 255, 255) });
    expect(at('RGB(1,2,3)')).toEqual({});
    expect(at('ansi:Red')).toEqual({});
    expect(at('ansi256(007)')).toEqual({ text: { form: 'ansi256', index: 7 } });
  });
});

describe('a theme colour as CSS (judgments)', () => {
  const css = (value: string, palette?: AnsiPalette) => {
    const color = readThemeColor(value);
    if (color === undefined) throw new Error(`${value} is a colour`);
    return themeColorToHex(color, palette);
  };

  test('rgb in every form is #rrggbb', () => {
    expect(css('#1a2B3c')).toBe('#1a2b3c');
    expect(css('#fa0')).toBe('#ffaa00');
    expect(css('rgb(1, 2, 255)')).toBe('#0102ff');
  });

  test('ansi:<name> is the palette entry: xterm by default, the host own when given', () => {
    expect(css('ansi:red')).toBe('#cd0000');
    expect(css('ansi:cyanBright')).toBe('#00ffff');
    expect(css('ansi:red', { ...XTERM_ANSI_PALETTE, red: '#ff5555' })).toBe('#ff5555');
  });

  test('ansi256 follows the palette for 0 to 15, the xterm cube and the grey ramp above', () => {
    expect(css('ansi256(1)')).toBe('#cd0000');
    expect(css('ansi256(1)', { ...XTERM_ANSI_PALETTE, red: '#ff5555' })).toBe('#ff5555');
    expect(css('ansi256(15)')).toBe('#ffffff');
    expect(css('ansi256(16)')).toBe('#000000');
    expect(css('ansi256(21)')).toBe('#0000ff');
    expect(css('ansi256(196)')).toBe('#ff0000');
    expect(css('ansi256(231)')).toBe('#ffffff');
    expect(css('ansi256(232)')).toBe('#080808');
    expect(css('ansi256(255)')).toBe('#eeeeee');
  });

  test('every palette index is a #rrggbb', () => {
    for (let index = 0; index <= 255; index++) {
      expect(css(`ansi256(${index})`)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
