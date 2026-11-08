import { error, type PluginIssue } from '../issues.ts';
import {
  ANY_CASING_NAMES,
  COMMUNITY_NAMES,
  DIRECTORY_NAMES,
  NON_MARKETPLACE_NAMES,
  OBJECT_MEMBER_NAMES,
  OFFICIAL_LISTS,
  OFFICIAL_NAMES,
} from './marketplace-name-lists.ts';
import type { MarketplaceSource, MarketplaceSourceKind } from './types.ts';

/**
 * Marketplace names (plugins/marketplace-reference.md, "Reserved names" and "Validation messages";
 * errors.md, "Plugin errors"; plugins/troubleshooting.md, "Cannot add marketplace"). The grammar
 * and the control-character rule are `ids.ts`; this file holds the lists the docs print and the
 * checks they describe.
 *
 * The docs split the rules in two. `claude plugin validate` reports impersonation and the reserved
 * names of the "Validation messages" table; "the exact official marketplace names ... pass
 * validation" and are refused when the marketplace is added or loaded, as are the other spellings,
 * the JavaScript member names, the `claudeai-` prefix and the download-folder clash. So there are
 * two functions: `validationNameIssues` (what `validate` prints) and `loadNameIssues` (what adding
 * or loading refuses, which `marketplaceNameIssues` adds to the first).
 */

const PATH = 'name';
const BRANDS: ReadonlySet<string> = new Set(['claude', 'anthropic', 'anthropics']);
/** A brand word followed by one of these reads as the name of an official marketplace (judgment). */
const OFFICIAL_SECOND_WORDS: ReadonlySet<string> = new Set([
  'marketplace',
  'marketplaces',
  'plugin',
  'plugins',
  'official',
  'directory',
]);

/**
 * The name as the impersonation check reads it: lower case, every run of characters that is not a
 * letter, digit or underscore one hyphen. An underscore is not a separator because the docs name
 * "a symbol other than an underscore" as the one that spells a hyphen (judgment, spec/judgments.md).
 */
const wordsOf = (name: string): string[] =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-');

/** A name that starts with the words of an official name that begins with a brand word. */
const OFFICIAL_BRAND_PREFIXES: readonly (readonly string[])[] = [
  ...OFFICIAL_NAMES,
  ...COMMUNITY_NAMES,
  ...DIRECTORY_NAMES,
]
  .map((name) => name.split('-'))
  .filter((words) => BRANDS.has(words[0] ?? ''));

const startsWithWords = (words: readonly string[], prefix: readonly string[]): boolean =>
  prefix.every((word, index) => words[index] === word);

const besideOfficial = (words: readonly string[]): boolean =>
  words.some(
    (word, index) =>
      word === 'official' &&
      (BRANDS.has(words[index - 1] ?? '') || BRANDS.has(words[index + 1] ?? '')),
  );

const leadsWithBrand = (words: readonly string[]): boolean =>
  BRANDS.has(words[0] ?? '') &&
  (OFFICIAL_SECOND_WORDS.has(words[1] ?? '') ||
    OFFICIAL_BRAND_PREFIXES.some((prefix) => startsWithWords(words, prefix)));

/** Which reserved name a trailing dot or a symbol in place of a hyphen spells ("v2.1.280"), if any. */
const RESERVED_SPELLINGS: ReadonlySet<string> = new Set([
  ...OFFICIAL_LISTS,
  ...NON_MARKETPLACE_NAMES.keys(),
]);

export function spellingOf(name: string): string | undefined {
  const spelled = name.replace(/\.+$/, '').replace(/[^A-Za-z0-9_-]/g, '-');
  return spelled !== name && RESERVED_SPELLINGS.has(spelled) ? spelled : undefined;
}

const NON_ASCII = /[^\p{ASCII}]/u;

/** Names such as `official-claude-plugins` or `claude-plugins-v2`, and any non-ASCII name (even one that spells a reserved name). */
function impersonates(name: string): boolean {
  if (NON_ASCII.test(name)) return true;
  if (RESERVED_SPELLINGS.has(name) || spellingOf(name) !== undefined) return false;
  const words = wordsOf(name);
  return besideOfficial(words) || leadsWithBrand(words);
}

function reservedVariantIssues(name: string): PluginIssue[] {
  const reason = NON_MARKETPLACE_NAMES.get(name);
  if (reason !== undefined) return [error(PATH, `Marketplace name "${name}" ${reason}`)];
  if (ANY_CASING_NAMES.has(name.toLowerCase())) {
    return [error(PATH, `Marketplace name "${name}" is reserved`)];
  }
  return [];
}

/** What `claude plugin validate` reports about a marketplace's name beyond the id grammar. */
export function validationNameIssues(name: string): PluginIssue[] {
  const found = reservedVariantIssues(name);
  if (impersonates(name)) {
    found.push(
      error(PATH, 'Marketplace name impersonates an official Anthropic/Claude marketplace'),
    );
  }
  return found;
}

/** `true` for the origins whose names may be the official ones: a `github` or `git` source under `github.com/anthropics/`. */
const ANTHROPICS_URL =
  /^(?:https?:\/\/github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:)anthropics\/[^/]/i;

const ORIGIN_URL: {
  readonly [K in MarketplaceSourceKind]: (source: MarketplaceSource) => string | undefined;
} = {
  github: (source) => ('repo' in source ? `https://github.com/${source.repo}` : undefined),
  git: (source) => ('url' in source ? source.url : undefined),
  url: () => undefined,
  npm: () => undefined,
  file: () => undefined,
  directory: () => undefined,
  settings: () => undefined,
  'skills-dir': () => undefined,
  hostPattern: () => undefined,
  pathPattern: () => undefined,
};

/** Whether the source is a git repository on GitHub (the kinds the refusal text tells apart). */
const IS_GIT_HOST: { readonly [K in MarketplaceSourceKind]: boolean } = {
  github: true,
  git: true,
  url: false,
  npm: false,
  file: false,
  directory: false,
  settings: false,
  'skills-dir': false,
  hostPattern: false,
  pathPattern: false,
};

const fromAnthropics = (origin: MarketplaceSource | undefined): boolean => {
  const url = origin === undefined ? undefined : ORIGIN_URL[origin.kind](origin);
  return url !== undefined && ANTHROPICS_URL.test(url);
};

function officialNameIssues(name: string, origin: MarketplaceSource | undefined): PluginIssue[] {
  if (!OFFICIAL_LISTS.has(name) || fromAnthropics(origin)) return [];
  const reserved = `The name '${name}' is reserved for official Anthropic marketplaces.`;
  const gitHost = origin !== undefined && IS_GIT_HOST[origin.kind];
  return [
    error(
      PATH,
      gitHost
        ? `${reserved} Only repositories from 'github.com/anthropics/' can use this name.`
        : `${reserved} The name can only be used with GitHub sources from the 'anthropics' organization.`,
    ),
  ];
}

function spellingIssues(name: string): PluginIssue[] {
  const reserved = spellingOf(name);
  if (reserved === undefined) return [];
  return [
    error(PATH, `"${name}" is another spelling of "${reserved}", a reserved marketplace name`),
  ];
}

function memberIssues(name: string): PluginIssue[] {
  if (!OBJECT_MEMBER_NAMES.has(name)) return [];
  return [
    error(
      PATH,
      `Cannot add marketplace "${name}": Claude Code reserves this name and cannot register a marketplace under it. The name is set by "name" in the marketplace's marketplace.json; ask its maintainer to change it.`,
    ),
  ];
}

const CLAUDE_AI_PREFIX = 'claudeai-';

function claudeAiIssues(name: string, hostedOnClaudeAi: boolean): PluginIssue[] {
  if (!name.startsWith(CLAUDE_AI_PREFIX) || hostedOnClaudeAi) return [];
  return [
    error(
      PATH,
      `Cannot add marketplace "${name}": names starting with "${CLAUDE_AI_PREFIX}" are reserved for marketplaces hosted on claude.ai`,
    ),
  ];
}

export interface NameOrigin {
  /** Where the marketplace came from; only a `github` or `git` source under `github.com/anthropics/` may use an official name. */
  readonly origin?: MarketplaceSource;
  /** The marketplace is hosted on claude.ai, the only one that may start with `claudeai-`. */
  readonly hostedOnClaudeAi?: boolean;
}

/** What adding or loading a marketplace refuses about its name, on top of `validationNameIssues`. */
export function loadNameIssues(name: string, where: NameOrigin = {}): PluginIssue[] {
  return [
    ...officialNameIssues(name, where.origin),
    ...spellingIssues(name),
    ...memberIssues(name),
    ...claudeAiIssues(name, where.hostedOnClaudeAi === true),
  ];
}

/** Every refusal a marketplace's name can draw: `validate`'s and adding or loading's. */
export function marketplaceNameIssues(name: string, where: NameOrigin = {}): PluginIssue[] {
  return [...validationNameIssues(name), ...loadNameIssues(name, where)];
}

/** A registered marketplace, as far as the download-folder rule needs it. */
export interface RegisteredMarketplace {
  readonly name: string;
  readonly source: MarketplaceSource;
}

/** Only a `github` source downloads through an `<owner>-<repo>` folder. */
const IS_GITHUB: { readonly [K in MarketplaceSourceKind]: boolean } = {
  github: true,
  git: false,
  url: false,
  npm: false,
  file: false,
  directory: false,
  settings: false,
  'skills-dir': false,
  hostPattern: false,
  pathPattern: false,
};

/** The folder Claude Code downloads a `github` marketplace through: `acme/x-tools` is `acme-x-tools`. */
const downloadFolder = (source: MarketplaceSource): string | undefined =>
  'repo' in source ? source.repo.replace('/', '-') : undefined;

/**
 * Adding a marketplace named like the download folder of another registered GitHub marketplace is
 * refused while that marketplace is registered under a different name (requires Claude Code
 * v2.1.290 or later).
 */
export function downloadFolderIssues(
  name: string,
  registered: readonly RegisteredMarketplace[],
): PluginIssue[] {
  const owner = registered.find(
    (other) =>
      other.name !== name && IS_GITHUB[other.source.kind] && downloadFolder(other.source) === name,
  );
  if (owner === undefined) return [];
  return [
    error(
      PATH,
      `Can't use the marketplace name "${name}": it is the download folder of the registered marketplace "${owner.name}"`,
    ),
  ];
}
