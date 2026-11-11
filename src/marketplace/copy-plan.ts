import { error, type PluginIssue } from '../format/issues.ts';
import { tooLarge, tooManyEntries, type CopyLimits } from './command-directory.ts';
import { linkReach, relativeFrom, type LinkReach } from '../format/link-rule.ts';
import { isWithin, withoutTrailingSlashes } from '../format/path-text.ts';

/**
 * What copying a plugin tree into the cache does with each entry (plugins/host-marketplace.md,
 * "Share files within a marketplace with symlinks"; plugins/marketplace-reference.md, "Output that
 * fails the install or update"): a plan over the entries a host listed without following links,
 * and over the real paths it resolved for each link. Nothing is read or written here.
 *
 * A link is handled "by where the target resolves": within the plugin it is kept as a relative
 * link, elsewhere in the marketplace it is dereferenced (the target's content is copied in its
 * place), outside the marketplace it is skipped. "For plugins installed from a local path, or from
 * a `command` source whose `mode` is the default `copy`", which have no marketplace to
 * dereference into, only a link within the plugin's own directory is kept.
 *
 * A dereferenced directory is the host's to list and plan again, with its children's paths below
 * the link's and its real path added to `TreeRoots.copying`. A link to a directory that is, or
 * contains, one being copied (the marketplace root, the plugin's own parent, a sibling that links
 * back) would copy the same tree again without end, so it is skipped as a `cycle` (spec/
 * judgments.md). A link whose target does not exist is skipped (judgment).
 */

export interface TreeEntry {
  /** Where the entry lands, relative to the plugin root and `/`-separated. */
  readonly path: string;
  readonly isDirectory: boolean;
  readonly isSymlink: boolean;
  /** The size of a file; 0 for a directory or a link. */
  readonly bytes: number;
  /** For a link: the real path it finally resolves to; absent when it points at nothing. */
  readonly target?: { readonly path: string; readonly isDirectory: boolean };
}

export interface TreeRoots {
  /** The real path of the plugin directory, spelled as the targets are. */
  readonly pluginRoot: string;
  /** The marketplace's real path; absent for a plugin installed from a local path or in copy mode. */
  readonly marketplaceRoot?: string;
  /**
   * The real paths of the directories already being copied above the one planned now: each
   * dereferenced directory the host went into, in order. The plugin root is always one.
   */
  readonly copying?: readonly string[];
}

export interface Relink {
  readonly path: string;
  /** The link's new target, relative to the folder the link is in and `/`-separated. */
  readonly target: string;
}

export interface Dereference {
  readonly path: string;
  /** The real path whose content is copied where the link was. */
  readonly from: string;
  readonly isDirectory: boolean;
}

export type SkipReason = 'outside-marketplace' | 'dangling' | 'cycle';

export interface TreePlan {
  /** Files and directories copied as they are. */
  readonly copy: readonly string[];
  readonly relinks: readonly Relink[];
  readonly dereferences: readonly Dereference[];
  readonly skipped: readonly { readonly path: string; readonly reason: SkipReason }[];
  /** The copy cannot be made: it is too large. */
  readonly refusals: readonly PluginIssue[];
}

type Link = TreeEntry;
type Decision =
  | { readonly relink: string }
  | { readonly dereference: Dereference }
  | { readonly skip: SkipReason };

const directoryOf = (path: string): string => path.split('/').slice(0, -1).join('/');

const withinPlugin = (link: Link, target: { path: string }, roots: TreeRoots): Decision => {
  const rel = target.path.slice(withoutTrailingSlashes(roots.pluginRoot).length).replace(/^\//, '');
  return { relink: relativeFrom(directoryOf(link.path), rel) };
};

/** A directory that is, or contains, one being copied: copying it would copy that one again. */
const closesCycle = (target: { path: string; isDirectory: boolean }, roots: TreeRoots): boolean =>
  target.isDirectory &&
  [roots.pluginRoot, ...(roots.copying ?? [])].some((open) => isWithin(target.path, open));

/** What each reach does with a link: the rule of the docs' three bullets, one entry per reach. */
const BY_REACH: {
  readonly [R in LinkReach]: (
    link: Link,
    target: { path: string; isDirectory: boolean },
    roots: TreeRoots,
  ) => Decision;
} = {
  'within-plugin': withinPlugin,
  'within-marketplace': (link, target, roots) =>
    closesCycle(target, roots)
      ? { skip: 'cycle' }
      : { dereference: { path: link.path, from: target.path, isDirectory: target.isDirectory } },
  outside: () => ({ skip: 'outside-marketplace' }),
};

function decideLink(link: Link, roots: TreeRoots): Decision {
  if (link.target === undefined) return { skip: 'dangling' };
  const reach = linkReach({ target: link.target.path, ...roots });
  return BY_REACH[reach](link, link.target, roots);
}

/** The refusal when what is copied is "larger than 256 MiB or has more than 20,000 entries". */
function limitRefusals(entries: readonly TreeEntry[], limits: CopyLimits): readonly PluginIssue[] {
  if (entries.length > limits.maxEntries) return [tooManyEntries(limits.maxEntries)];
  const bytes = entries.reduce((total, one) => total + one.bytes, 0);
  return bytes > limits.maxBytes ? [tooLarge(limits.maxBytes)] : [];
}

/** A plan of copying `entries`; `limits` apply to a tree that is copied whole (a `command` source in copy mode). */
export function planTreeCopy(
  entries: readonly TreeEntry[],
  roots: TreeRoots,
  limits?: CopyLimits,
): TreePlan {
  const copy: string[] = [];
  const relinks: Relink[] = [];
  const dereferences: Dereference[] = [];
  const skipped: { path: string; reason: SkipReason }[] = [];
  for (const entry of entries) {
    if (!entry.isSymlink) {
      copy.push(entry.path);
      continue;
    }
    const decision = decideLink(entry, roots);
    if ('relink' in decision) relinks.push({ path: entry.path, target: decision.relink });
    else if ('dereference' in decision) dereferences.push(decision.dereference);
    else skipped.push({ path: entry.path, reason: decision.skip });
  }
  const refusals = limits === undefined ? [] : limitRefusals(entries, limits);
  return { copy, relinks, dereferences, skipped, refusals };
}

/**
 * The refusal for a plugin directory of a fetched marketplace that is, or passes through, a link
 * that resolves outside the marketplace ("an entry of a fetched marketplace that resolves or opens
 * outside its tree", plugins/troubleshooting.md): the listing line `claude plugin list` shows.
 */
export function pluginRootIssue(input: {
  readonly entryPath: string;
  readonly pluginRoot: string;
  readonly marketplaceRoot: string;
}): PluginIssue | undefined {
  return isWithin(input.marketplaceRoot, input.pluginRoot)
    ? undefined
    : error(
        'source',
        `Plugin source path refused: ${input.entryPath} does not stay inside its marketplace directory. Check that the marketplace entry has a plain relative path.`,
      );
}
