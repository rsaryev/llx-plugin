import { warning } from '../format/issues.ts';
import { MARKETPLACE_SOURCE_KINDS } from '../protocol/settings-keys.ts';
import type { ChannelPluginRef, MarketplaceSource } from '../protocol/official.ts';
import { dropped, failedClosed, kept, stripInvalid, where, type Repair } from './repair-support.ts';
import { isRecord } from './record.ts';

const readString = (entry: unknown): string | undefined =>
  typeof entry === 'string' ? entry : undefined;

/** A list of texts: a non-text entry is dropped, a value that is no list is dropped whole. */
export const stringList: Repair = (value, at) => {
  if (!Array.isArray(value)) return dropped(at, `"${at.key}" must be a list of texts`);
  const { entries, issues } = stripInvalid(value, at, readString, 'Expected a text');
  return kept(entries, issues);
};

/**
 * `allowedHttpHookUrls` and `httpHookAllowedEnvVars`: an allowlist that is unreadable in managed
 * settings is enforced as an empty one (managed-settings.md, "Keys that fail closed"), an entry
 * that is invalid is stripped and the rest enforced.
 */
export const closedStringList: Repair = (value, at) => {
  if (Array.isArray(value)) return stringList(value, at);
  return at.closed ? failedClosed(at, [], 'an empty allowlist') : stringList(value, at);
};

/** `plugin@marketplace`, the string form of an `allowedChannelPlugins` entry (settings-reference.md). */
const CHANNEL_STRING = /^([^@\s]+)@([^@\s]+)$/;

function readChannelEntry(entry: unknown): ChannelPluginRef | undefined {
  if (typeof entry === 'string') {
    const [, plugin, marketplace] = CHANNEL_STRING.exec(entry) ?? [];
    return plugin === undefined || marketplace === undefined ? undefined : { marketplace, plugin };
  }
  if (!isRecord(entry)) return undefined;
  const { marketplace, plugin } = entry;
  return typeof marketplace === 'string' && typeof plugin === 'string'
    ? { marketplace, plugin }
    : undefined;
}

/**
 * `allowedChannelPlugins`: an entry is `{ marketplace, plugin }` or the string `plugin@marketplace`,
 * which Claude Code "treats as the equivalent object", so the result holds objects only.
 */
export const channelAllowlist: Repair = (value, at) => {
  if (!Array.isArray(value)) {
    return at.closed
      ? failedClosed(at, [], 'an empty allowlist: no channel plugin is admitted')
      : dropped(at, `"${at.key}" must be a list`);
  }
  const { entries, issues } = stripInvalid(
    value,
    at,
    readChannelEntry,
    'Expected { marketplace, plugin } or "plugin@marketplace"',
  );
  return kept(entries, issues);
};

/** The text fields each source kind requires (settings-reference.md, "Allowed source types"). */
const REQUIRED_FIELDS: { readonly [K in MarketplaceSource['source']]: readonly string[] } = {
  github: ['repo'],
  git: ['url'],
  url: ['url'],
  file: ['path'],
  directory: ['path'],
  hostPattern: ['hostPattern'],
  pathPattern: ['pathPattern'],
  'skills-dir': [],
  // The docs' table has no row for these two; the SDK types them (spec/judgments.md).
  npm: ['package'],
  settings: ['name'],
};

/** The fields of a source that are regular expressions, compiled with JavaScript's `RegExp`. */
const REGEX_FIELDS: readonly string[] = ['hostPattern', 'pathPattern'];

const isSourceKind = (kind: unknown): kind is MarketplaceSource['source'] =>
  MARKETPLACE_SOURCE_KINDS.some((known) => known === kind);

/** A source object: a known `source` kind with the text fields that kind requires. */
function readSource(entry: unknown): Readonly<Record<string, unknown>> | undefined {
  if (!isRecord(entry) || !isSourceKind(entry.source)) return undefined;
  return REQUIRED_FIELDS[entry.source].every((field) => typeof entry[field] === 'string')
    ? entry
    : undefined;
}

/** The regex fields of a source entry that do not compile. */
function brokenRegexFields(entry: Readonly<Record<string, unknown>>): string[] {
  return REGEX_FIELDS.filter((field) => {
    const pattern = entry[field];
    if (typeof pattern !== 'string') return false;
    try {
      new RegExp(pattern).test('');
      return false;
    } catch {
      return true;
    }
  });
}

/**
 * `strictKnownMarketplaces`: unreadable in managed settings it is an empty allowlist, a total
 * lockdown; an entry that is invalid or "can't be enforced, such as a `hostPattern` regex that
 * doesn't compile, is stripped and the valid subset is enforced" (managed-settings.md).
 */
export const strictSources: Repair = (value, at) => {
  if (!Array.isArray(value)) {
    return at.closed
      ? failedClosed(at, [], 'an empty allowlist: no marketplace source is admitted')
      : dropped(at, `"${at.key}" must be a list of marketplace sources`);
  }
  const { entries, issues } = stripInvalid(
    value,
    at,
    (entry) => {
      const source = readSource(entry);
      return source !== undefined && brokenRegexFields(source).length === 0 ? source : undefined;
    },
    'Not a marketplace source the allowlist can enforce',
  );
  return kept(entries, issues);
};

/**
 * `blockedMarketplaces`: an invalid entry is stripped; "an entry that parses but can never match,
 * such as a `hostPattern` regex that doesn't compile, is kept with a warning" (so the restriction
 * stays active); a wholly invalid value is dropped with a warning, since blocking every
 * marketplace would block sources the policy never named (managed-settings.md).
 */
export const blockedSources: Repair = (value, at) => {
  if (!Array.isArray(value)) {
    return dropped(at, `"${at.key}" must be a list of marketplace sources`);
  }
  const { entries, issues } = stripInvalid(value, at, readSource, 'Not a marketplace source');
  const never = entries.flatMap((entry, index) =>
    brokenRegexFields(entry).map((field) =>
      warning(
        where(at, `[${index}]`),
        `"${field}" is not a valid regular expression, so the entry blocks nothing`,
      ),
    ),
  );
  return kept(entries, [...issues, ...never]);
};
