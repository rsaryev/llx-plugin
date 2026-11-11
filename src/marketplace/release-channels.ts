import { error, warning, type PluginIssue } from '../format/issues.ts';
import type {
  Marketplace,
  MarketplaceEntry,
  PluginSource,
  PluginSourceKind,
  PluginSourceOf,
} from '../format/marketplace/types.ts';
import { usableVersion } from './version-resolution.ts';

/**
 * Release channels (plugins/host-marketplace.md, "Run release channels"): "Claude Code has no
 * release-channel concept". A channel is a marketplace whose entries point at another ref of the same
 * plugin; the two `marketplace.json` files need different `name` values, because "a user can't have
 * two marketplaces with the same name registered at once", and the two refs need different versions,
 * or none, because "updates are detected by comparing versions, so a ref that moves without a version
 * change leaves users on the cached copy". This checks the pair as a hosting author would before
 * publishing; the issues are findings for the author, not a refusal Claude Code makes.
 */

/** The `version` of each plugin's `plugin.json` at the ref a channel points at, by plugin name. It wins over the entry's version. */
export type ChannelManifestVersions = ReadonlyMap<string, string>;

export interface ChannelManifests {
  readonly first?: ChannelManifestVersions;
  readonly second?: ChannelManifestVersions;
}

type RefOf<K extends PluginSourceKind> = (source: PluginSourceOf<K>) => string | undefined;

const none = (): undefined => undefined;

const pin = (where: string, source: { readonly ref?: string; readonly sha?: string }): string =>
  `${where}#${source.ref ?? ''}@${source.sha ?? ''}`;

/**
 * Where a source points, as one comparable string: the repository (and subdirectory) with its `ref`
 * and `sha`. A git source with neither points at the default branch, which is a place too. Every
 * source that has no ref (a path, an npm package, an archive, a command) is `undefined`: it names
 * no channel.
 */
const POINTS_AT: { readonly [K in PluginSourceKind]: RefOf<K> } = {
  relative: none,
  github: (source) => pin(source.repo, source),
  url: (source) => pin(source.url, source),
  'git-subdir': (source) => pin(`${source.url}:${source.path}`, source),
  npm: none,
  archive: none,
  command: none,
};

function pointsAt<K extends PluginSourceKind>(
  kind: K,
  source: PluginSourceOf<K>,
): string | undefined {
  return POINTS_AT[kind](source);
}

const refOf = (source: PluginSource): string | undefined => pointsAt(source.kind, source);

/** The version a channel declares for an entry: `plugin.json`'s, then the entry's; a blank one, or one that names no folder, is not set (`usableVersion`, the rule the install uses). */
const channelVersion = (
  entry: MarketplaceEntry,
  manifests: ChannelManifestVersions | undefined,
): string | undefined => usableVersion(manifests?.get(entry.name)) ?? usableVersion(entry.version);

const NAMES = (name: string): PluginIssue =>
  error(
    'name',
    `Both marketplaces are named "${name}": give the two marketplace.json files different name values, because Claude Code identifies a marketplace by its name`,
  );

const sameVersion = (name: string, version: string): PluginIssue =>
  warning(
    `plugins.${name}.version`,
    `Both channels declare version "${version}" for "${name}": give the two refs different versions, or omit version so the commit SHA distinguishes them, because a ref that moves without a version change leaves users on the cached copy`,
  );

const sameRef = (name: string): PluginIssue =>
  warning(
    `plugins.${name}.source`,
    `Both channels point "${name}" at the same ref and sha: a channel needs its own ref of the plugin`,
  );

function pluginFindings(
  one: MarketplaceEntry,
  other: MarketplaceEntry,
  manifests: ChannelManifests,
): PluginIssue[] {
  const found: PluginIssue[] = [];
  const first = channelVersion(one, manifests.first);
  const second = channelVersion(other, manifests.second);
  if (first !== undefined && first === second) found.push(sameVersion(one.name, first));
  const ref = refOf(one.source);
  if (ref !== undefined && ref === refOf(other.source)) found.push(sameRef(one.name));
  return found;
}

/**
 * What is wrong with `first` and `second` as the two catalogs of a channel pair. Judgments
 * (spec/judgments.md): the same name is an error and the rest are warnings; only plugins both list
 * are compared; an unset version on either side is fine (the SHA tells them apart); two entries that
 * point at the same ref and sha are reported, since they are not two channels.
 */
export function checkReleaseChannels(
  first: Marketplace,
  second: Marketplace,
  manifests: ChannelManifests = {},
): readonly PluginIssue[] {
  const naming = first.name === second.name ? [NAMES(first.name)] : [];
  const byName = new Map(second.plugins.map((entry) => [entry.name, entry]));
  const plugins = first.plugins.flatMap((entry) => {
    const other = byName.get(entry.name);
    return other === undefined ? [] : pluginFindings(entry, other, manifests);
  });
  return [...naming, ...plugins];
}
