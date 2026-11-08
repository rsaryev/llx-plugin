/**
 * terminal-config.md § Create a custom theme: what the docs leave open about a theme file (a file that
 * is not an object, unrecognized fields, the SDK's preset list, the edges of the colour grammar), the
 * kit's judgments (spec/judgments.md), tested outside spec().
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { readTheme } from '../../src/format/theme.ts';
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
