/**
 * The marketplace gate: `strictKnownMarketplaces` and `blockedMarketplaces` as verdicts over a
 * policy view (settings-reference.md, both keys; plugins/org.md, "Restrict what users can install").
 * Effects stay the host's: the kit says whether a source may be added, installed, updated,
 * refreshed, auto-updated or loaded, and why.
 */
import type { MarketplaceSource } from '../../protocol/official.ts';
import { PLUGIN_ONLY_SURFACES } from '../../protocol/settings-keys.ts';
import type { PolicyView } from '../view.ts';
import { matchMarketplaceSource, type ListKind } from './match-source.ts';
import { byKind, type ByKind, type SourceKind } from './source-kinds.ts';

export type SourceVerdict =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly by: 'blockedMarketplaces' | 'strictKnownMarketplaces';
      readonly message: string;
    };

export type RegisteredVerdict =
  | { readonly loads: true }
  | { readonly loads: false; readonly message: string };

/** Whether skills-directory plugins (`@skills-dir`) load, and the list that stops them. */
export type SkillsDirVerdict =
  | { readonly admitted: true }
  | {
      readonly admitted: false;
      readonly by:
        | 'blockedMarketplaces'
        | 'strictKnownMarketplaces'
        | 'strictPluginOnlyCustomization';
    };

export interface MarketplaceGate {
  /** On add, install, update, refresh and auto-update: may a marketplace come from this source? */
  check(source: MarketplaceSource): SourceVerdict;
  /** At session start: does a marketplace registered from this source still load its plugins? */
  checkRegistered(name: string, source: MarketplaceSource): RegisteredVerdict;
  /** A marketplace Claude Code cannot find: it does not load while a restriction is active. */
  checkMissing(name: string): RegisteredVerdict;
  /** Any allowlist is set, or the blocklist names a source other than `skills-dir`. */
  restrictionActive(): boolean;
  /** `skills-dir` entries: whether skills-directory plugins may load. */
  skillsDirectoryPlugins(): SkillsDirVerdict;
}

/** What names a place a marketplace comes from: every kind but `skills-dir` (plugins/org.md). */
const NAMES_A_MARKETPLACE: { readonly [K in SourceKind]: boolean } = {
  github: true,
  git: true,
  url: true,
  file: true,
  directory: true,
  npm: true,
  settings: true,
  hostPattern: true,
  pathPattern: true,
  'skills-dir': false,
};

/** The kinds written as the `owner/repo` shorthand, which points at github.com (plugins/org.md). */
const IS_SHORTHAND: { readonly [K in SourceKind]: boolean } = {
  github: true,
  git: false,
  url: false,
  file: false,
  directory: false,
  npm: false,
  settings: false,
  hostPattern: false,
  pathPattern: false,
  'skills-dir': false,
};

/** The kinds that admit a git host by hostname. */
const ADMITS_BY_HOSTNAME: { readonly [K in SourceKind]: boolean } = {
  ...IS_SHORTHAND,
  github: false,
  hostPattern: true,
};

/** The one line that names a source in a message (judgment: the docs quote no per-kind wording). */
const LABELS: ByKind<string> = {
  github: (source) => `github:${source.repo}`,
  git: (source) => `git:${source.url}`,
  url: (source) => `url:${source.url}`,
  file: (source) => `file:${source.path}`,
  directory: (source) => `directory:${source.path}`,
  npm: (source) => `npm:${source.package}`,
  settings: (source) => `settings:${source.name}`,
  hostPattern: (source) => `hostPattern:${source.hostPattern}`,
  pathPattern: (source) => `pathPattern:${source.pathPattern}`,
  'skills-dir': () => 'skills-dir',
};

const label = (source: MarketplaceSource): string => byKind(LABELS, source);

const BLOCKED_BY_POLICY = 'is blocked by enterprise policy';
const NOT_ALLOWED = 'is not in the allowed marketplace list';

const matchesAny = (
  list: ListKind,
  entries: readonly MarketplaceSource[],
  source: MarketplaceSource,
): boolean => entries.some((entry) => matchMarketplaceSource(list, entry, source));

const namesSkillsDir = (entries: readonly MarketplaceSource[]): boolean =>
  entries.some((entry) => !NAMES_A_MARKETPLACE[entry.source]);

const GUIDANCE_BLOCKED = 'This marketplace source is explicitly blocked by your administrator';
const GUIDANCE_CONTACT = 'Contact your administrator to configure allowed marketplace sources';
const NO_EXTERNAL = 'No external marketplaces are allowed.';
const GITHUB_TIP =
  'Tip: the owner/repo shorthand assumes github.com. If the repository lives on your internal host, add it again with its full URL, such as git@your-git-host.com:owner/repo.git';

const allowedSources = (entries: readonly MarketplaceSource[]): string =>
  `Allowed sources: ${entries.map(label).join(', ')}`;

/** Judgment: the tail the docs name; an empty list says so, a non-empty one lists its sources. */
const allowlistTail = (entries: readonly MarketplaceSource[]): string =>
  entries.length === 0 ? NO_EXTERNAL : allowedSources(entries);

/** The allowlist admits a git host by hostname, yet the shorthand points at github.com. */
const needsGithubTip = (
  entries: readonly MarketplaceSource[],
  source: MarketplaceSource,
): boolean =>
  IS_SHORTHAND[source.source] && entries.some((entry) => ADMITS_BY_HOSTNAME[entry.source]);

/** `strictPluginOnlyCustomization` is `true` or names at least one kind of customization. */
const locksCustomization = (value: unknown): boolean =>
  value === true ||
  (Array.isArray(value) &&
    value.some((surface) => PLUGIN_ONLY_SURFACES.some((known) => known === surface)));

const blockedMessage = (source: MarketplaceSource): string =>
  `Marketplace source '${label(source)}' ${BLOCKED_BY_POLICY}`;

const notAllowedMessage = (name: string, entries: readonly MarketplaceSource[]): string =>
  `Marketplace "${name}" ${NOT_ALLOWED}\n${entries.length === 0 ? GUIDANCE_CONTACT : allowedSources(entries)}`;

const registeredBlockedMessage = (name: string): string =>
  `Marketplace "${name}" ${BLOCKED_BY_POLICY}\n${GUIDANCE_BLOCKED}`;

export function createMarketplaceGate(view: PolicyView): MarketplaceGate {
  const strict = (): readonly MarketplaceSource[] | undefined =>
    view.get('strictKnownMarketplaces');
  const blocked = (): readonly MarketplaceSource[] => view.get('blockedMarketplaces') ?? [];
  const restrictionActive = (): boolean =>
    strict() !== undefined || blocked().some((entry) => NAMES_A_MARKETPLACE[entry.source]);

  return {
    check(source) {
      if (matchesAny('blocked', blocked(), source)) {
        return {
          allowed: false,
          by: 'blockedMarketplaces',
          message: blockedMessage(source),
        };
      }
      const allowlist = strict();
      if (allowlist === undefined || matchesAny('strict', allowlist, source))
        return { allowed: true };
      return {
        allowed: false,
        by: 'strictKnownMarketplaces',
        message: `${blockedMessage(source)}. ${allowlistTail(allowlist)}${needsGithubTip(allowlist, source) ? `\n${GITHUB_TIP}` : ''}`,
      };
    },
    checkRegistered(name, source) {
      if (matchesAny('blocked', blocked(), source)) {
        return { loads: false, message: registeredBlockedMessage(name) };
      }
      const allowlist = strict();
      return allowlist === undefined || matchesAny('strict', allowlist, source)
        ? { loads: true }
        : { loads: false, message: notAllowedMessage(name, allowlist) };
    },
    checkMissing(name) {
      if (!restrictionActive()) return { loads: true };
      // Judgment: the docs say /plugin "shows the policy error"; the allowlist's wording wins when
      // both lists are set, since it is the one that makes every unlisted marketplace unusable.
      const allowlist = strict();
      return {
        loads: false,
        message:
          allowlist === undefined
            ? registeredBlockedMessage(name)
            : notAllowedMessage(name, allowlist),
      };
    },
    restrictionActive,
    skillsDirectoryPlugins() {
      if (namesSkillsDir(blocked())) return { admitted: false, by: 'blockedMarketplaces' };
      // Applies "whether or not the entry is present" (plugins/org.md, "Keep skills-directory plugins loading").
      if (locksCustomization(view.get('strictPluginOnlyCustomization')))
        return { admitted: false, by: 'strictPluginOnlyCustomization' };
      const allowlist = strict();
      return allowlist === undefined || namesSkillsDir(allowlist)
        ? { admitted: true }
        : { admitted: false, by: 'strictKnownMarketplaces' };
    },
  };
}
