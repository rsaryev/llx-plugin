import type {
  MarketplaceSource,
  MarketplaceSourceKind,
  PluginSource,
  PluginSourceKind,
  PluginSourceOf,
} from '../format/marketplace/types.ts';
import { computePluginVersion, type PluginVersionInput } from './plugin-version.ts';

/**
 * How Claude Code decides a plugin has an update (plugins/loading.md, "Versions and updates"):
 * `claude plugin update` and background auto-update "compute the version again and don't replace
 * the cached copy when it matches what `installed_plugins.json` records". A new copy is made only
 * when the computed version differs; the kit decides, the host copies. Versions are strings, never
 * ranked: a version that goes backwards differs just the same (host-marketplace.md, "Users get a new
 * copy only when the plugin's computed version differs from the one they have").
 */

export type UpdateOutcome = 'unchanged' | 'new copy';

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

/** What the update check is about: where the plugin comes from decides which version counts. */
export type UpdateSubject =
  /** A marketplace plugin copied into the cache: its computed version. */
  | { readonly from: 'marketplace'; readonly version: PluginVersionInput }
  /** A plugin loaded in place: there is no copy to replace (`loadsInPlace`). */
  | { readonly from: 'in-place' }
  /**
   * A plugin of a marketplace hosted on claude.ai: "the version claude.ai records for the plugin is
   * its version". `manifestVersion` is what the host read from the manifest; it is never used.
   */
  | {
      readonly from: 'claude-ai';
      readonly recordedVersion: string;
      readonly manifestVersion?: string;
    };

export type UpdateCheck = UpdateOutcome | 'loaded in place';

const CHECK: {
  readonly [F in UpdateSubject['from']]: (
    subject: Extract<UpdateSubject, { from: F }>,
    installed: string | undefined,
  ) => UpdateCheck;
} = {
  marketplace: (subject, installed) => isUpdate(installed, computePluginVersion(subject.version)),
  'in-place': () => 'loaded in place',
  'claude-ai': (subject, installed) => isUpdate(installed, subject.recordedVersion),
};

function check<F extends UpdateSubject['from']>(
  from: F,
  subject: Extract<UpdateSubject, { from: F }>,
  installed: string | undefined,
): UpdateCheck {
  return CHECK[from](subject, installed);
}

/** The outcome of an update check for a plugin whose installed version is `installed`. */
export const checkForUpdate = (
  subject: UpdateSubject,
  installed: string | undefined,
): UpdateCheck => check(subject.from, subject, installed);
