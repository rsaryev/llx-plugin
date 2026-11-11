import type {
  MarketplaceSource,
  MarketplaceSourceKind,
  PluginSource,
  PluginSourceKind,
  PluginSourceOf,
} from '../format/marketplace/types.ts';
import type { Sha256 } from '../ports/marketplace.ts';
import { resolvePluginVersion, usableVersion, type VersionInput } from './version-resolution.ts';

/**
 * How Claude Code decides a plugin has an update (plugins/loading.md, "Versions and updates"):
 * `claude plugin update` and background auto-update "compute the version again and don't replace
 * the cached copy when it matches what `installed_plugins.json` records". A new copy is made only
 * when the computed version differs; the kit decides, the host copies. The docs say a new copy is made
 * "only when the plugin's computed version differs from the one they have" (host-marketplace.md) and
 * do not say it must be higher; comparing as strings is the kit's judgment (spec/judgments.md).
 */

export type UpdateOutcome = 'unchanged' | 'new copy';

/**
 * What `claude plugin update` prints when the computed version is unchanged: "<name> is already at
 * the latest version (<version>)." (plugins/loading.md, "Versions and updates"; cli-reference.md).
 */
export const upToDateMessage = (name: string, version: string): string =>
  `${name} is already at the latest version (${version}).`;

/**
 * Whether `computed` is an update over what `installed_plugins.json` records for the plugin. A
 * plugin with no record has nothing cached, so it installs (judgment, spec/judgments.md).
 */
export const isUpdate = (installed: string | undefined, computed: string): UpdateOutcome =>
  installed === computed ? 'unchanged' : 'new copy';

/** The marketplace sources that are a local path: "a marketplace you added from a local path". */
const LOCAL_MARKETPLACE: { readonly [K in MarketplaceSourceKind]: boolean } = {
  url: false,
  github: false,
  git: false,
  npm: false,
  file: true,
  directory: true,
  settings: false,
  'skills-dir': false,
  hostPattern: false,
  pathPattern: false,
};

const isLocalPath = (origin: MarketplaceSource | undefined): boolean =>
  origin !== undefined && LOCAL_MARKETPLACE[origin.kind];

/** A command source in `link` mode "loads the files in place"; in `copy` mode it is copied. */
const LINKED_MODE: { readonly [M in 'copy' | 'link']: boolean } = { copy: false, link: true };

type InPlace<K extends PluginSourceKind> = (
  source: PluginSourceOf<K>,
  origin: MarketplaceSource | undefined,
) => boolean;

const never = (): boolean => false;

/** Per source type: does it load from where it is kept? (plugins/loading.md, "In-place and copied plugins".) */
const IN_PLACE: { readonly [K in PluginSourceKind]: InPlace<K> } = {
  relative: (_source, origin) => isLocalPath(origin),
  github: never,
  url: never,
  'git-subdir': never,
  npm: never,
  archive: never,
  command: (source) => LINKED_MODE[source.mode],
};

function inPlace<K extends PluginSourceKind>(
  kind: K,
  source: PluginSourceOf<K>,
  origin: MarketplaceSource | undefined,
): boolean {
  return IN_PLACE[kind](source, origin);
}

/**
 * Whether a marketplace plugin is loaded in place rather than copied into the cache: a relative
 * path of a marketplace added from a local path, and a `command` source in `link` mode. Every other
 * marketplace plugin "is copied into `cache/<marketplace>/<plugin>/<version>/` at install". The
 * `--plugin-dir` and skills-directory plugins are in place too but come from no marketplace entry.
 */
export const loadsInPlace = (
  source: PluginSource,
  origin: MarketplaceSource | undefined,
): boolean => inPlace(source.kind, source, origin);

/**
 * What the update check is about: `source` and `origin` decide whether the plugin loads in place
 * (`loadsInPlace`); `version` is what the install computed its version from, given again with what
 * the host learns now (`resolvePluginVersion`, the one version rule: a plugin of a marketplace hosted
 * on claude.ai sets `recordedByClaudeAi`).
 */
export interface UpdateSubject {
  readonly source: PluginSource;
  readonly origin: MarketplaceSource | undefined;
  readonly version: VersionInput;
}

export type UpdateCheck = UpdateOutcome | 'loaded in place';

/** The outcome of the check and the version computed again, which a new copy is made at. */
export interface UpdateVerdict {
  readonly check: UpdateCheck;
  readonly version: string;
}

/**
 * The outcome of an update check for a plugin whose installed version is `installed`: a plugin that
 * loads in place is never compared, whatever its version string says.
 */
export async function checkForUpdate(
  subject: UpdateSubject,
  installed: string | undefined,
  sha256: Sha256,
): Promise<UpdateVerdict> {
  const { version } = await resolvePluginVersion(subject.version, sha256);
  const check = loadsInPlace(subject.source, subject.origin)
    ? 'loaded in place'
    : isUpdate(installed, version);
  return { check, version };
}

/** What the host knows of a plugin before it fetches anything: the entry's source and marketplace, and a claude.ai record. */
export interface UpdatePrecheck {
  readonly source: PluginSource;
  readonly origin: MarketplaceSource | undefined;
  /** The version a marketplace hosted on claude.ai records for the plugin. */
  readonly recordedByClaudeAi?: string;
}

/** `fetch`: the version can come from what the fetch brings, so `checkForUpdate` decides after it. */
export type PrecheckOutcome = UpdateCheck | 'fetch';

/**
 * The update check a host can run before it fetches: a plugin loaded in place is never compared,
 * and a claude.ai record is the version ("the manifest's `version` isn't read"), compared by
 * `isUpdate`, the one comparison. Any other version may come from the manifest or the source, so it
 * is `fetch` (judgment, spec/judgments.md): a host never settles it by comparing versions itself.
 */
export function precheckUpdate(
  subject: UpdatePrecheck,
  installed: string | undefined,
): PrecheckOutcome {
  if (loadsInPlace(subject.source, subject.origin)) return 'loaded in place';
  const recorded = usableVersion(subject.recordedByClaudeAi);
  return recorded === undefined ? 'fetch' : isUpdate(installed, recorded);
}
