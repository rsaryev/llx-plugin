/**
 * terminal-config.md § Create a custom theme (the three optional fields `name`, `base` and `overrides`;
 * the colour forms; "Unknown tokens and invalid color values are ignored"; the `dracula` and `midnight`
 * files; the token reference). How a bad value is reported, which tokens the kit knows beyond the
 * docs' tables and the colour grammar's edges are the kit's judgments (spec/judgments.md), tested
 * outside spec().
 */
import { expect, test } from 'bun:test';
import { customThemeId, readTheme, themeSlug } from '../../src/format/theme.ts';
import { ANSI_COLOR_NAMES, THEME_BASES, THEME_TOKEN_NAMES } from '../../src/format/theme-tokens.ts';
import { json } from '../support/plugin-folder.ts';
import { spec } from '../support/spec.ts';

const DRACULA = json({
  name: 'Dracula',
  base: 'dark',
  overrides: { claude: '#bd93f9', error: '#ff5555', success: '#50fa7b' },
});

const MIDNIGHT = json({
  name: 'Midnight',
  base: 'dark',
  overrides: {
    claude: '#a78bfa',
    planMode: '#38bdf8',
    diffAdded: '#14532d',
    diffRemoved: '#7f1d1d',
    userMessageBackground: '#1e1b4b',
  },
});

const rgb = (r: number, g: number, b: number) => ({ form: 'rgb', r, g, b }) as const;

/** The token tables of "Color token reference", copied by hand, one entry per row. */
const TABLE_TOKENS = [
  'claude',
  'text',
  'inverseText',
  'inactive',
  'subtle',
  'suggestion',
  'permission',
  'remember',
  'success',
  'error',
  'warning',
  'merged',
  'promptBorder',
  'planMode',
  'autoAccept',
  'bashBorder',
  'ide',
  'fastMode',
  'effortUltra',
  'diffAdded',
  'diffRemoved',
  'diffAddedDimmed',
  'diffRemovedDimmed',
  'diffAddedWord',
  'diffRemovedWord',
  'userMessageBackground',
  'userMessageBackgroundHover',
  'bashMessageBackgroundColor',
  'memoryBackgroundColor',
  'selectionBg',
  'composerSidebarBackground',
  'rate_limit_fill',
  'rate_limit_empty',
  'briefLabelYou',
  'briefLabelClaude',
  'claudeShimmer',
  'warningShimmer',
  'permissionShimmer',
  'promptBorderShimmer',
  'inactiveShimmer',
  'fastModeShimmer',
];
const SUBAGENT_COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'cyan'];
const RAINBOW = ['red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'violet'];

spec('themes.config.Create a custom theme.name', () => {
  test('the docs example: the name is the label shown in /theme', () => {
    const { theme, issues } = readTheme('dracula', DRACULA);
    expect(theme?.name).toBe('Dracula');
    expect(theme?.slug).toBe('dracula');
    expect(issues).toEqual([]);
  });

  test('without a name the filename slug is the label', () => {
    for (const body of ['{}', json({ base: 'light' }), json({ name: '' }), json({ name: 4 })]) {
      expect(readTheme('solarized', body).theme?.name).toBe('solarized');
    }
  });

  test('the slug is the file name without .json, and selecting the theme stores custom:<slug>', () => {
    expect(themeSlug('~/.claude/themes/dracula.json')).toBe('dracula');
    expect(themeSlug('themes/midnight.json')).toBe('midnight');
    expect(themeSlug('C:\\Users\\me\\.claude\\themes\\night.owl.json')).toBe('night.owl');
    expect(customThemeId('dracula')).toBe('custom:dracula');
  });
});

spec('themes.config.Create a custom theme.base', () => {
  test('the six built-in presets are the bases', () => {
    for (const base of [
      'dark',
      'light',
      'dark-daltonized',
      'light-daltonized',
      'dark-ansi',
      'light-ansi',
    ]) {
      const { theme, issues } = readTheme('t', json({ base }));
      expect<string | undefined>(theme?.base).toBe(base);
      expect(issues).toEqual([]);
    }
    expect([...THEME_BASES].toSorted()).toEqual([
      'dark',
      'dark-ansi',
      'dark-daltonized',
      'light',
      'light-ansi',
      'light-daltonized',
    ]);
  });

  test('the base defaults to dark', () => {
    expect(readTheme('t', '{}').theme?.base).toBe('dark');
    expect(readTheme('t', json({ name: 'x' })).theme?.base).toBe('dark');
  });

  test('a value that is not a preset falls back to dark and says so (judgment)', () => {
    for (const base of ['solarized', 'auto', 'Dark', 7]) {
      const { theme, issues } = readTheme('t', json({ base }));
      expect(theme?.base).toBe('dark');
      expect(issues.map((found) => found.severity)).toEqual(['warning']);
      expect(issues[0]?.message).toContain('base');
    }
  });
});

spec('themes.config.Create a custom theme.overrides', () => {
  test('the docs examples: tokens map to colours', () => {
    const dracula = readTheme('dracula', DRACULA).theme;
    expect(dracula?.overrides).toEqual({
      claude: rgb(0xbd, 0x93, 0xf9),
      error: rgb(0xff, 0x55, 0x55),
      success: rgb(0x50, 0xfa, 0x7b),
    });
    const midnight = readTheme('midnight', MIDNIGHT);
    expect(midnight.issues).toEqual([]);
    expect(midnight.theme?.overrides.userMessageBackground).toEqual(rgb(0x1e, 0x1b, 0x4b));
    expect(Object.keys(midnight.theme?.overrides ?? {})).toHaveLength(5);
  });

  test('a colour is #rrggbb, #rgb, rgb(r,g,b), ansi256(n) or ansi:<name>', () => {
    const { theme, issues } = readTheme(
      't',
      json({
        overrides: {
          text: '#FFAA00',
          error: '#f80',
          success: 'rgb(1, 2,3)',
          warning: 'ansi256(208)',
          merged: 'ansi:red',
          subtle: 'ansi:cyanBright',
        },
      }),
    );
    expect(issues).toEqual([]);
    expect(theme?.overrides).toEqual({
      text: rgb(255, 170, 0),
      error: rgb(255, 136, 0),
      success: rgb(1, 2, 3),
      warning: { form: 'ansi256', index: 208 },
      merged: { form: 'ansi', name: 'red' },
      subtle: { form: 'ansi', name: 'cyanBright' },
    });
  });

  test('the 16 standard ANSI colour names are the names ansi: accepts', () => {
    expect(ANSI_COLOR_NAMES).toHaveLength(16);
    const names = ANSI_COLOR_NAMES.map((name) => `ansi:${name}`);
    const overrides = Object.fromEntries(names.map((value, i) => [TABLE_TOKENS[i], value]));
    const { theme, issues } = readTheme('t', json({ overrides }));
    expect(issues).toEqual([]);
    expect(Object.keys(theme?.overrides ?? {})).toHaveLength(16);
  });

  test('an invalid colour value is dropped, the rest of the theme stays, and the file still loads', () => {
    const bad = [
      '#12',
      '#12345',
      '#gggggg',
      'red',
      'rgb(256,0,0)',
      'rgb(1,2)',
      'ansi256(256)',
      'ansi256(-1)',
      'ansi:purple',
      'ansi:',
      '',
      42,
      null,
      ['#fff'],
    ];
    for (const value of bad) {
      const { theme, issues } = readTheme('t', json({ overrides: { error: value, text: '#fff' } }));
      expect(theme?.overrides).toEqual({ text: rgb(255, 255, 255) });
      expect(issues.map((found) => found.severity)).toEqual(['warning']);
      expect(issues[0]?.path).toBe('overrides.error');
    }
  });

  test('an unknown token is ignored: no error, no entry, and a typo cannot break the theme', () => {
    const { theme, issues } = readTheme(
      't',
      json({ overrides: { claud: '#fff', errror: 'nope', error: '#f00' } }),
    );
    expect(issues).toEqual([]);
    expect(theme?.overrides).toEqual({ error: rgb(255, 0, 0) });
    expect(theme?.unknownTokens).toEqual(['claud', 'errror']);
  });

  test('tokens not listed are absent, so they fall through to the base preset', () => {
    const { theme } = readTheme('t', json({ base: 'light', overrides: { error: '#f00' } }));
    expect(Object.keys(theme?.overrides ?? {})).toEqual(['error']);
    expect(readTheme('t', json({ base: 'light' })).theme?.overrides).toEqual({});
  });

  test('every token of the reference tables, the subagent colours and the rainbow are tokens', () => {
    const subagents = SUBAGENT_COLORS.map((color) => `${color}_FOR_SUBAGENTS_ONLY`);
    const rainbow = RAINBOW.flatMap((color) => [`rainbow_${color}`, `rainbow_${color}_shimmer`]);
    const all = [...TABLE_TOKENS, ...subagents, ...rainbow];
    const overrides = Object.fromEntries(all.map((token) => [token, '#010203']));
    const { theme, issues } = readTheme('t', json({ overrides }));
    expect(issues).toEqual([]);
    expect(theme?.unknownTokens).toEqual([]);
    expect(Object.keys(theme?.overrides ?? {}).toSorted()).toEqual(all.toSorted());
    expect([...THEME_TOKEN_NAMES].toSorted()).toEqual(all.toSorted());
  });

  test('overrides that is not an object is ignored with a warning, a list does not read as a map', () => {
    for (const overrides of ['#fff', ['error'], 3]) {
      const { theme, issues } = readTheme('t', json({ overrides }));
      expect(theme?.overrides).toEqual({});
      expect(issues.map((found) => found.path)).toEqual(['overrides']);
    }
  });

  test('prototype names are not tokens', () => {
    const body = '{"overrides":{"__proto__":"#fff","constructor":"#fff","toString":"#fff"}}';
    const { theme } = readTheme('t', body);
    expect(theme?.overrides).toEqual({});
    expect(theme?.unknownTokens).toEqual(['__proto__', 'constructor', 'toString']);
  });
});
