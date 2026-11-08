import { isRecord } from '../record.ts';
import type { Found } from './check-support.ts';

/**
 * Managed `sandbox.credentials` entries (settings-reference.md, "Invalid credential entries in
 * managed settings"): an entry in `files` or `envVars` with a valid `path` or `name` and a `mode` of
 * `mask` or `deny` that fails validation anywhere else "is degraded to `mode: "deny"` with a
 * warning, so the credential stays blocked, not masked"; an entry with an unknown `mode` or an
 * invalid `path` or `name` is stripped. Each case warns and the valid entries stay. A `deny` entry
 * accepts the mask fields and ignores them, so only a `mask` entry is checked against them. The two
 * lists have their own rules (the tables "Mask fields for files" and "Mask fields for environment
 * variables").
 */
type Entry = Readonly<Record<string, unknown>>;

const MODES: readonly unknown[] = ['deny', 'mask'];
const DENY_MODES: readonly unknown[] = ['deny'];

/** Whether a credential entry has `mode: "deny"`: it blocks the credential and needs no repair. */
export const isDenyEntry = (entry: unknown): boolean =>
  isRecord(entry) && DENY_MODES.includes(entry.mode);
const isText = (value: unknown): value is string => typeof value === 'string';
const isTexts = (value: unknown): boolean => Array.isArray(value) && value.every(isText);
/** "at least one claim name". */
const isClaims = (value: unknown): boolean =>
  isTexts(value) && Array.isArray(value) && value.length > 0;

/** "A regular expression with at least one capturing group". */
function isExtract(value: unknown): boolean {
  if (!isText(value)) return false;
  try {
    // The pattern must compile and hold a capturing group: `|` adds an empty alternative, so it matches.
    return (new RegExp(`${value}|`).exec('')?.length ?? 0) > 1;
  } catch {
    return false;
  }
}

/** The mask fields both lists take. */
const SHARED_FIELDS: Readonly<Record<string, (value: unknown) => boolean>> = {
  extract: isExtract,
  onExtractNoMatch: (value) => value === 'warn' || value === 'deny' || value === 'error',
  decode: (value) => value === 'jwt',
  maskClaims: isClaims,
  injectHosts: isTexts,
};

/** `maskClaims` "requires `decode`". */
const claimsNeedDecode = (entry: Entry): boolean =>
  entry.maskClaims === undefined || entry.decode !== undefined;

interface Group {
  readonly list: 'files' | 'envVars';
  readonly identity: 'path' | 'name';
  readonly identityValid: (value: unknown) => boolean;
  /** The mask fields the list takes, each with the values it accepts. */
  readonly fields: Readonly<Record<string, (value: unknown) => boolean>>;
  /** What an entry's fields must satisfy together. */
  readonly rules: readonly ((entry: Entry) => boolean)[];
  /** What the warning of a degraded entry adds. */
  readonly degradedNote: string;
}

/** An environment variable "must start with a letter or underscore and contain only letters, digits, and underscores". */
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

const GROUPS: readonly Group[] = [
  {
    list: 'files',
    identity: 'path',
    identityValid: (value) => isText(value) && value !== '',
    fields: { ...SHARED_FIELDS, maskDuplicates: (value) => typeof value === 'boolean' },
    rules: [claimsNeedDecode],
    // "A degraded `files` entry pins `filesystem.disabled` like an explicit `deny` entry".
    degradedNote:
      '. Its read block is not enforced if managed settings turn filesystem isolation off',
  },
  {
    list: 'envVars',
    identity: 'name',
    identityValid: (value) => isText(value) && ENV_NAME.test(value),
    fields: SHARED_FIELDS,
    rules: [
      claimsNeedDecode,
      // "`extract` and `decode` can't be combined on the same entry."
      (entry) => entry.extract === undefined || entry.decode === undefined,
      // "On an entry with `decode`, only `"warn"` is accepted."
      (entry) => entry.decode === undefined || (entry.onExtractNoMatch ?? 'warn') === 'warn',
    ],
    degradedNote: '',
  },
];

/** Whether every field the entry sets beyond its identity and mode is valid for the list, and together. */
const isWhole = (entry: Entry, group: Group): boolean =>
  Object.entries(entry).every(([field, value]) => {
    if (field === group.identity || field === 'mode') return true;
    return group.fields[field]?.(value) ?? false;
  }) && group.rules.every((rule) => rule(entry));

function repairEntry(
  entry: unknown,
  group: Group,
  at: string,
): { readonly entry?: Entry; readonly found?: Found } {
  const { identity } = group;
  if (!isRecord(entry) || !group.identityValid(entry[identity])) {
    return { found: { at, message: `The entry has no valid "${identity}"; the entry is dropped` } };
  }
  if (!MODES.includes(entry.mode)) {
    return { found: { at, message: 'The entry has an unknown "mode"; the entry is dropped' } };
  }
  if (isDenyEntry(entry) || isWhole(entry, group)) return { entry };
  return {
    entry: { [identity]: entry[identity], mode: 'deny' },
    found: {
      at,
      message: `The entry is invalid; it is degraded to mode "deny" so the credential stays blocked until you fix it${group.degradedNote}`,
    },
  };
}

function repairGroup(
  value: unknown,
  group: Group,
): { readonly kept?: readonly Entry[]; readonly found: readonly Found[] } {
  const at = `.credentials.${group.list}`;
  if (value === undefined) return { found: [] };
  if (!Array.isArray(value)) {
    return { found: [{ at, message: `"${group.list}" must be a list; the list is dropped` }] };
  }
  const repaired = value.map((entry, index) => repairEntry(entry, group, `${at}[${index}]`));
  return {
    kept: repaired.flatMap((one) => (one.entry === undefined ? [] : [one.entry])),
    found: repaired.flatMap((one) => (one.found === undefined ? [] : [one.found])),
  };
}

/** The `credentials` block after the per-entry repair, with what was said about it. */
export function repairCredentials(block: unknown): { value: unknown; found: readonly Found[] } {
  if (!isRecord(block)) {
    return {
      value: undefined,
      found: [
        { at: '.credentials', message: '"credentials" must be an object; the block is dropped' },
      ],
    };
  }
  const groups = GROUPS.map((group) => ({ group, ...repairGroup(block[group.list], group) }));
  const rest = Object.entries(block).filter(([name]) => !GROUPS.some((one) => one.list === name));
  const kept = groups.flatMap(({ group, kept: entries }) =>
    entries === undefined ? [] : [[group.list, entries]],
  );
  return {
    value: Object.fromEntries([...rest, ...kept]),
    found: groups.flatMap((one) => one.found),
  };
}
