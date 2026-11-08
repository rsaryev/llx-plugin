import type { MarketplaceSource, MarketplaceSourceKind } from '../format/marketplace/types.ts';
import type { SubmoduleRule } from './types.ts';

/**
 * Which git submodules of the marketplace repository a relative-path plugin needs (plugins/
 * marketplace-reference.md, "Git submodules in the marketplace repository", Claude Code v2.1.295
 * and later): pure, the paths in `.gitmodules` and what the plugin's files say in, the paths to
 * fetch out. The host reads the files and runs the fetch; the kit only decides.
 */

/** A marketplace clone has submodules to fetch only when it is added from git. */
const CLONED: { readonly [K in MarketplaceSourceKind]: boolean } = {
  github: true,
  git: true,
  url: false,
  file: false,
  directory: false,
  npm: false,
  'skills-dir': false,
  hostPattern: false,
  pathPattern: false,
  settings: false,
};

const hasSparsePaths = (origin: MarketplaceSource): boolean =>
  'sparsePaths' in origin && (origin.sparsePaths?.length ?? 0) > 0;

/**
 * The rule for a plugin at `path` ("." at the root) of a marketplace added as `origin`: a sparse
 * checkout "fetches no submodule", a marketplace that was not cloned has none to fetch, a plugin
 * at the root gets every submodule or none, any other plugin only the ones it touches.
 */
export function submoduleRuleFor(
  path: string,
  origin: MarketplaceSource | undefined,
): SubmoduleRule {
  if (origin !== undefined && (!CLONED[origin.kind] || hasSparsePaths(origin))) return 'none';
  return path === '.' ? 'whole-repository' : 'plugin-subtree';
}

/** What the plugin's repository and files say about its submodules; every path is relative to the repository root. */
export interface SubmoduleEvidence {
  /** The `path` of every submodule in `.gitmodules` (`submodulePaths` reads them). */
  readonly submodules: readonly string[];
  /** The plugin's directory: `.` at the root. */
  readonly plugin: string;
  /** Where each symbolic link committed to the repository points. */
  readonly linkTargets: readonly string[];
  /** Root plugin: the directories at the root that hold plugin components (`skills/`, `hooks/`, `bin/`). */
  readonly componentDirectories: readonly string[];
  /** Root plugin: the paths written in the marketplace entry, `plugin.json` and config files (`.mcp.json`, `hooks/hooks.json`). */
  readonly configPaths: readonly string[];
  /** Root plugin: the text of the config files and of the files under the component directories. */
  readonly texts: readonly string[];
  /** The kit "can't tell which ones hold plugin files": a `SKILL.md` at the root, or an unreadable marketplace file, config file or `.gitmodules`. */
  readonly undecidable: boolean;
}

/** A path as a plain `a/b`: no leading `./`, no trailing `/`; the root is `.`. */
function tidy(path: string): string {
  const trimmed = path
    .replaceAll('\\', '/')
    .replace(/^(\.\/)+/, '')
    .replace(/\/+$/, '');
  return trimmed === '' ? '.' : trimmed;
}

/** `outer` is `inner` or a directory above it. */
function holds(outer: string, inner: string): boolean {
  const a = tidy(outer);
  const b = tidy(inner);
  return a === '.' || b === a || b.startsWith(`${a}/`);
}

const overlaps = (a: string, b: string): boolean => holds(a, b) || holds(b, a);

/** A plugin in a subdirectory: it is in the submodule, the submodule is in it, or a link points into the submodule. */
function touchesSubtree(submodule: string, evidence: SubmoduleEvidence): boolean {
  return (
    overlaps(submodule, evidence.plugin) ||
    evidence.linkTargets.some((target) => holds(submodule, target))
  );
}

/** A plugin at the root: a component directory, a configured path or a link points into the submodule, or a text names it. */
function touchesRoot(submodule: string, evidence: SubmoduleEvidence): boolean {
  const named = tidy(submodule);
  return (
    evidence.componentDirectories.some((directory) => overlaps(submodule, directory)) ||
    evidence.configPaths.some((path) => overlaps(submodule, path)) ||
    evidence.linkTargets.some((target) => holds(submodule, target)) ||
    evidence.texts.some((text) => text.includes(named))
  );
}

/** Every submodule when the kit cannot tell, else the ones `touches` picks (all or none for a root plugin). */
const inSubtree = (evidence: SubmoduleEvidence): readonly string[] =>
  evidence.undecidable
    ? evidence.submodules.map(tidy)
    : evidence.submodules.filter((path) => touchesSubtree(path, evidence)).map(tidy);

const inRepository = (evidence: SubmoduleEvidence): readonly string[] => {
  const all = evidence.submodules.map(tidy);
  if (evidence.undecidable) return all;
  return evidence.submodules.some((path) => touchesRoot(path, evidence)) ? all : [];
};

const SELECTORS: {
  readonly [R in SubmoduleRule]: (evidence: SubmoduleEvidence) => readonly string[];
} = {
  none: () => [],
  'plugin-subtree': inSubtree,
  'whole-repository': inRepository,
};

/**
 * The submodules to fetch, in `.gitmodules` order. A root plugin gets all of them or none; when the
 * kit cannot tell, every one (unless the rule is `none`). A path counts when it is the submodule or
 * inside it, and also when it holds the submodule (spec/judgments.md): the rule errs toward fetching.
 */
export function selectSubmodules(
  rule: SubmoduleRule,
  evidence: SubmoduleEvidence,
): readonly string[] {
  return SELECTORS[rule](evidence);
}

const MODULE_PATH = /^\s*path\s*=\s*(.+?)\s*$/i;

/** The `path` of each submodule in the text of a `.gitmodules` file, in file order. */
export function submodulePaths(gitmodules: string): readonly string[] {
  return gitmodules
    .split(/\r?\n/)
    .map((line) => MODULE_PATH.exec(line)?.[1])
    .filter((path): path is string => path !== undefined)
    .map(tidy);
}
