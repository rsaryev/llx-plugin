import { isNetworkPath } from '../../rules/path/network.ts';
import { warning } from '../../format/issues.ts';
import type { PolicyScope } from '../../settings/layers.ts';
import type { Contribution, Customization, FlagContext } from './types.ts';
import { refuse } from './types.ts';

/**
 * `--add-dir` (cli-reference.md, "CLI flags"; permissions.md, "Additional directories grant file
 * access, not configuration"): extra working directories for reading and editing files. Each path
 * "exists as a directory" or startup fails; "most network paths" cannot be added
 * ("... is a network path, which cannot be added as a working directory", errors.md). The
 * configuration a flag-added directory also loads is a fixed list, and the modes that remove a kind
 * remove it here too: skills, commands and subagents "load through the `project` setting source, so
 * they don't load when you exclude" it, `--bare` "skips the commands and subagents among them" but
 * keeps the skills, and `CLAUDE.local.md` "additionally requires the `local` setting source". What
 * loads is derived from the plan once every flag is combined (`session-flags.ts`).
 */

/** The configuration types loaded from an `--add-dir` directory. */
export const ADD_DIR_CONFIGURATION = [
  'skills',
  'commands',
  'agents',
  'settings:enabledPlugins',
  'settings:extraKnownMarketplaces',
  'claude-md',
  'claude-local-md',
] as const;
export type AddDirConfiguration = (typeof ADD_DIR_CONFIGURATION)[number];

/** What decides the load: the combined plan of the flags and the one variable the docs name. */
export interface LoadFacts {
  readonly bare: boolean;
  readonly claudeMdEnabled: boolean;
  /** The customizations the modes skip (`SessionPlan.skipped`). */
  readonly skipped: readonly Customization[];
  /** The settings scopes that load; absent means every one (`SessionPlan.settingScopes`). */
  readonly settingScopes?: readonly PolicyScope[];
}

const skips = (facts: LoadFacts, kind: Customization): boolean => facts.skipped.includes(kind);
const hasScope = (facts: LoadFacts, scope: PolicyScope): boolean =>
  facts.settingScopes === undefined || facts.settingScopes.includes(scope);

/** CLAUDE.md, `.claude/rules/` and `CLAUDE.local.md`: "Only when `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1` is set". */
const claudeMd = (facts: LoadFacts): boolean => facts.claudeMdEnabled && !skips(facts, 'claude-md');

/**
 * One row per kind: whether a flag-added directory loads it. Judgment (spec/judgments.md): the two
 * settings keys load through the `addDir` scope and follow the installed plugins a mode skips.
 */
const LOADS: { readonly [K in AddDirConfiguration]: (facts: LoadFacts) => boolean } = {
  // `--bare` is the one exception: it skips skills as a kind and still loads these.
  skills: (facts) => hasScope(facts, 'project') && (facts.bare || !skips(facts, 'skills')),
  commands: (facts) => hasScope(facts, 'project') && !skips(facts, 'commands'),
  agents: (facts) => hasScope(facts, 'project') && !skips(facts, 'agents'),
  'settings:enabledPlugins': (facts) =>
    hasScope(facts, 'addDir') && !skips(facts, 'installed-plugins'),
  'settings:extraKnownMarketplaces': (facts) =>
    hasScope(facts, 'addDir') && !skips(facts, 'installed-plugins'),
  'claude-md': claudeMd,
  'claude-local-md': (facts) => claudeMd(facts) && hasScope(facts, 'local'),
};

export const addDirLoads = (facts: LoadFacts): readonly AddDirConfiguration[] =>
  ADD_DIR_CONFIGURATION.filter((kind) => LOADS[kind](facts));

const notDirectory = (path: string): string => `--add-dir: ${path} is not a directory`;
const networkPath = (path: string): string =>
  `${path} is a network path, which cannot be added as a working directory`;

export function addDir(paths: readonly string[], context: FlagContext): Contribution {
  const { facts } = context;
  const network = paths.filter((path) => isNetworkPath(path, facts.platform));
  const local = paths.filter((path) => !network.includes(path));
  const bad = local.filter((path) => facts.directories[path] !== 'directory');
  if (bad.length > 0) return refuse(...bad.map(notDirectory));
  return {
    additionalDirectories: local,
    warnings: network.map((path) => warning('--add-dir', networkPath(path))),
  };
}
