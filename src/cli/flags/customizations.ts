import { CUSTOMIZATIONS, type Customization } from './types.ts';

/**
 * The customizations a mode leaves out (cli-reference.md, `--bare`, `--safe-mode`,
 * `--disable-slash-commands`; headless.md, "Start faster with bare mode"; env-vars.md,
 * `CLAUDE_CODE_SIMPLE` and `CLAUDE_CODE_SAFE_MODE`). `installed-plugins` is the plugins installed
 * from marketplaces: a plugin loaded by `--plugin-dir` or `--plugin-url` still loads in bare mode
 * ("A plugin: `--plugin-dir <path>`, `--plugin-url <url>`" is what to pass to load one). The docs
 * name the eight of `--bare` and the fifteen of `--safe-mode`; whatever neither names stays loaded
 * (spec/judgments.md).
 */
export const SKIP_MODES = ['bare', 'safe-mode', 'disable-slash-commands'] as const;
export type SkipMode = (typeof SKIP_MODES)[number];

const skippedIn = (
  bare: boolean,
  safeMode: boolean,
  noSlash: boolean,
): { readonly [M in SkipMode]: boolean } => ({
  bare,
  'safe-mode': safeMode,
  'disable-slash-commands': noSlash,
});

/** One row per customization, so a kind added to the union fails the typecheck until it is placed. */
const SKIPPED_BY: { readonly [C in Customization]: { readonly [M in SkipMode]: boolean } } = {
  hooks: skippedIn(true, true, false),
  skills: skippedIn(true, true, true),
  commands: skippedIn(true, true, true),
  agents: skippedIn(true, true, false),
  'installed-plugins': skippedIn(true, true, false),
  'mcp-servers': skippedIn(true, true, false),
  'auto-memory': skippedIn(true, true, false),
  'claude-md': skippedIn(true, true, false),
  'output-styles': skippedIn(false, true, false),
  workflows: skippedIn(false, true, false),
  themes: skippedIn(false, true, false),
  keybindings: skippedIn(false, true, false),
  'status-line': skippedIn(false, true, false),
  'file-suggestion': skippedIn(false, true, false),
  'lsp-servers': skippedIn(false, true, false),
};

/** The customizations `mode` skips, in the order of `CUSTOMIZATIONS`. */
export const skippedBy = (mode: SkipMode): readonly Customization[] =>
  CUSTOMIZATIONS.filter((customization) => SKIPPED_BY[customization][mode]);

/**
 * What `--safe-mode` does with the managed layer of a customization it skips: "Managed settings
 * policy still applies, including policy-configured hooks, status line, and file-suggestion
 * commands; managed plugins, managed skills, managed CLAUDE.md, and policy-configured MCP servers do
 * not." The docs say nothing of the other kinds, so they are absent.
 */
export const MANAGED_UNDER_SAFE_MODE: { readonly [C in Customization]?: 'applies' | 'skipped' } = {
  hooks: 'applies',
  'status-line': 'applies',
  'file-suggestion': 'applies',
  'installed-plugins': 'skipped',
  skills: 'skipped',
  'claude-md': 'skipped',
  'mcp-servers': 'skipped',
};
