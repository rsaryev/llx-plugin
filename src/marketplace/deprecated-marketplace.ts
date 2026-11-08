/**
 * The deprecated `claude-code-plugins` marketplace (plugins/anthropic-marketplaces.md, "Deprecated
 * `claude-code-plugins` marketplace"): what to run for an install that used to come from it and for the
 * two plugins that changed. Pure; the docs' commands.
 */

export const DEPRECATED_MARKETPLACE = 'claude-code-plugins';
const OFFICIAL_MARKETPLACE = 'claude-plugins-official';

/** Where a plugin of the deprecated marketplace is installed from now: "run `claude plugin install <plugin>@claude-plugins-official`". */
export const officialInstallCommand = (plugin: string): string =>
  `claude plugin install ${plugin}@${OFFICIAL_MARKETPLACE}`;

/** The tutorial step to skip. */
export const SKIPPED_TUTORIAL_STEP = '/plugin marketplace add anthropics/claude-code';

export interface DeprecatedPluginAdvice {
  /** What changed. */
  readonly change: 'renamed' | 'retired';
  /** The command to run in a shell. */
  readonly command: string;
  /** For a rename, the prefix the commands have now. */
  readonly commandPrefix?: string;
}

const ADVICE: Readonly<Record<string, DeprecatedPluginAdvice>> = {
  'ralph-wiggum': {
    change: 'renamed',
    command: officialInstallCommand('ralph-loop'),
    commandPrefix: '/ralph-loop:',
  },
  'claude-opus-4-5-migration': {
    change: 'retired',
    command: `claude plugin uninstall claude-opus-4-5-migration@${DEPRECATED_MARKETPLACE}`,
  },
};

/** Advice for the two plugins that need it; `undefined` for every other: "you can leave your plugins and the marketplace as they are". */
export const deprecatedPluginAdvice = (plugin: string): DeprecatedPluginAdvice | undefined =>
  Object.hasOwn(ADVICE, plugin) ? ADVICE[plugin] : undefined;
