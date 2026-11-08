/**
 * The names a theme file is made of (terminal-config.md, "Create a custom theme"): the six built-in
 * presets `base` takes, the 16 ANSI colour names, and the tokens `overrides` takes.
 */

/** "Built-in preset the theme starts from" (the `base` row). The SDK's `theme` setting lists the same six, plus `auto`. */
export const THEME_BASES = [
  'dark',
  'light',
  'dark-daltonized',
  'light-daltonized',
  'dark-ansi',
  'light-ansi',
] as const;
export type ThemeBase = (typeof THEME_BASES)[number];

/** "Defaults to `dark`". */
export const DEFAULT_THEME_BASE: ThemeBase = 'dark';

/**
 * The 16 standard ANSI colour names `ansi:<name>` takes. The docs name two ("such as `red` or
 * `cyanBright`"); the rest follow the same scheme: eight colours and their `Bright` forms
 * (spec/judgments.md).
 */
const BASE_ANSI_COLORS = [
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
] as const;
export const ANSI_COLOR_NAMES = [
  ...BASE_ANSI_COLORS,
  ...BASE_ANSI_COLORS.map((name) => `${name}Bright` as const),
] as const;
export type AnsiColorName = (typeof ANSI_COLOR_NAMES)[number];

const SUBAGENT_COLORS = [
  'red',
  'blue',
  'green',
  'yellow',
  'purple',
  'orange',
  'pink',
  'cyan',
] as const;
const RAINBOW_COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'violet'] as const;

/**
 * The tokens of the "Color token reference" tables, the paired shimmer variants, the eight
 * `<color>_FOR_SUBAGENTS_ONLY` names and the `rainbow_<color>` (and `_shimmer`) names. The docs say
 * the list omits "a few single-purpose accents such as onboarding screen colors" (judgment: those
 * are reported as `unknownTokens`, never as a problem).
 */
const DOCUMENTED_TOKENS = [
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

export const THEME_TOKEN_NAMES: readonly string[] = [
  ...DOCUMENTED_TOKENS,
  ...SUBAGENT_COLORS.map((color) => `${color}_FOR_SUBAGENTS_ONLY`),
  ...RAINBOW_COLORS.flatMap((color) => [`rainbow_${color}`, `rainbow_${color}_shimmer`]),
];
