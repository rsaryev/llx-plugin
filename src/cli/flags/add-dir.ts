import { isNetworkPath } from '../../rules/path/network.ts';
import { warning } from '../../format/issues.ts';
import type { Contribution, FlagContext } from './types.ts';
import { refuse } from './types.ts';

/**
 * `--add-dir` (cli-reference.md, "CLI flags"; permissions.md, "Additional directories grant file
 * access, not configuration"): extra working directories for reading and editing files. Each path
 * "exists as a directory" or startup fails; "most network paths" cannot be added
 * ("... is a network path, which cannot be added as a working directory", errors.md). The
 * configuration a flag-added directory also loads is a fixed list, and `--bare` keeps only its
 * skills ("still skips its `.claude/commands/` and `.claude/agents/` folders").
 */

/** The configuration types loaded from an `--add-dir` directory. */
export const ADD_DIR_CONFIGURATION = [
  'skills',
  'commands',
  'agents',
  'settings:enabledPlugins',
  'settings:extraKnownMarketplaces',
  'claude-md',
] as const;
export type AddDirConfiguration = (typeof ADD_DIR_CONFIGURATION)[number];

interface LoadFacts {
  readonly bare: boolean;
  readonly claudeMdEnabled: boolean;
}

/** One row per kind: whether a flag-added directory loads it. */
const LOADS: { readonly [K in AddDirConfiguration]: (facts: LoadFacts) => boolean } = {
  skills: () => true,
  commands: ({ bare }) => !bare,
  agents: ({ bare }) => !bare,
  // Judgment (spec/judgments.md): "bare mode ... skips" what it does not name, so the two settings keys stay out.
  'settings:enabledPlugins': ({ bare }) => !bare,
  'settings:extraKnownMarketplaces': ({ bare }) => !bare,
  // "Only when `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1` is set"; bare skips CLAUDE.md.
  'claude-md': ({ bare, claudeMdEnabled }) => !bare && claudeMdEnabled,
};

export const addDirLoads = (facts: LoadFacts): readonly AddDirConfiguration[] =>
  ADD_DIR_CONFIGURATION.filter((kind) => LOADS[kind](facts));

const notDirectory = (path: string): string => `--add-dir: ${path} is not a directory`;
const networkPath = (path: string): string =>
  `${path} is a network path, which cannot be added as a working directory`;

export function addDir(paths: readonly string[], context: FlagContext): Contribution {
  const { facts, given } = context;
  const network = paths.filter((path) => isNetworkPath(path, facts.platform));
  const local = paths.filter((path) => !network.includes(path));
  const bad = local.filter((path) => facts.directories[path] !== 'directory');
  if (bad.length > 0) return refuse(...bad.map(notDirectory));
  return {
    additionalDirectories: local,
    addDirLoads: addDirLoads({
      bare: given['--bare'] === true,
      claudeMdEnabled: facts.env.CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD === '1',
    }),
    warnings: network.map((path) => warning('--add-dir', networkPath(path))),
  };
}
