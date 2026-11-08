/**
 * The marketplace gate: `strictKnownMarketplaces` and `blockedMarketplaces` as verdicts over a
 * policy view (settings-reference.md, both keys; plugins/org.md, "Restrict what users can install").
 * Effects stay the host's: the kit says whether a source may be added, installed, updated,
 * refreshed, auto-updated or loaded, and why.
 */
import type { MarketplaceSource } from '../../protocol/official.ts';
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
  | { readonly admitted: false; readonly by: 'blockedMarketplaces' | 'strictKnownMarketplaces' };

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

const allowedSources = (entries: readonly MarketplaceSource[]): string =>
  entries.length === 0 ? 'none' : entries.map(label).join(', ');

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
          message: `Marketplace source ${label(source)} ${BLOCKED_BY_POLICY}`,
        };
      }
      const allowlist = strict();
      if (allowlist === undefined || matchesAny('strict', allowlist, source))
        return { allowed: true };
      return {
        allowed: false,
        by: 'strictKnownMarketplaces',
        message: `Marketplace source ${label(source)} ${BLOCKED_BY_POLICY}. Allowed sources: ${allowedSources(allowlist)}`,
      };
    },
    checkRegistered(name, source) {
      if (matchesAny('blocked', blocked(), source)) {
        return { loads: false, message: `Marketplace "${name}" ${BLOCKED_BY_POLICY}` };
      }
      const allowlist = strict();
      return allowlist === undefined || matchesAny('strict', allowlist, source)
        ? { loads: true }
        : { loads: false, message: `Marketplace "${name}" ${NOT_ALLOWED}` };
    },
    checkMissing(name) {
      if (!restrictionActive()) return { loads: true };
      // Judgment: the docs say /plugin "shows the policy error"; the allowlist's wording wins when
      // both lists are set, since it is the one that makes every unlisted marketplace unusable.
      return {
        loads: false,
        message: `Marketplace "${name}" ${strict() === undefined ? BLOCKED_BY_POLICY : NOT_ALLOWED}`,
      };
    },
    restrictionActive,
    skillsDirectoryPlugins() {
      if (namesSkillsDir(blocked())) return { admitted: false, by: 'blockedMarketplaces' };
      const allowlist = strict();
      return allowlist === undefined || namesSkillsDir(allowlist)
        ? { admitted: true }
        : { admitted: false, by: 'strictKnownMarketplaces' };
    },
  };
}
