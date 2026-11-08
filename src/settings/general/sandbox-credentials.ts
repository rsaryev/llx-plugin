import { isRecord } from '../record.ts';
import type { Found } from './check-support.ts';

/**
 * Managed `sandbox.credentials` entries (settings-reference.md, "Invalid credential entries in
 * managed settings"): an entry in `files` or `envVars` with a valid `path` or `name` and a `mode` of
 * `mask` or `deny` that fails validation anywhere else "is degraded to `mode: "deny"` with a
 * warning, so the credential stays blocked, not masked"; an entry with an unknown `mode` or an
 * invalid `path` or `name` is stripped. Each case warns and the valid entries stay.
 */
const GROUPS = [
  { list: 'files', identity: 'path' },
  { list: 'envVars', identity: 'name' },
] as const;

const MODES: readonly unknown[] = ['deny', 'mask'];
const isText = (value: unknown): value is string => typeof value === 'string';
const isTexts = (value: unknown): boolean => Array.isArray(value) && value.every(isText);

/** The optional fields of an entry and whether a value is valid for each. */
const FIELDS: Readonly<Record<string, (value: unknown) => boolean>> = {
  extract: (value) => {
    if (!isText(value)) return false;
    try {
      // The pattern must compile and hold a capturing group: `|` adds an empty alternative, so it matches.
      return (new RegExp(`${value}|`).exec('')?.length ?? 0) > 1;
    } catch {
      return false;
    }
  },
  onExtractNoMatch: (value) => ['warn', 'deny', 'error'].includes(String(value)),
  decode: (value) => value === 'jwt',
  maskClaims: isTexts,
  maskDuplicates: (value) => typeof value === 'boolean',
  injectHosts: isTexts,
};

type Entry = Readonly<Record<string, unknown>>;

/** Whether every field the entry sets beyond its identity and mode is valid. */
const isWhole = (entry: Entry, identity: string): boolean =>
  Object.entries(entry).every(([field, value]) => {
    if (field === identity || field === 'mode') return true;
    return FIELDS[field]?.(value) ?? false;
  });

function repairEntry(
  entry: unknown,
  identity: string,
  at: string,
): { readonly entry?: Entry; readonly found?: Found } {
  if (!isRecord(entry) || !isText(entry[identity]) || entry[identity] === '') {
    return { found: { at, message: `The entry has no valid "${identity}"; the entry is dropped` } };
  }
  if (!MODES.includes(entry.mode)) {
    return { found: { at, message: 'The entry has an unknown "mode"; the entry is dropped' } };
  }
  if (isWhole(entry, identity)) return { entry };
  return {
    entry: { [identity]: entry[identity], mode: 'deny' },
    found: {
      at,
      message: `The entry is invalid; it is degraded to mode "deny" so the credential stays blocked until you fix it`,
    },
  };
}

function repairGroup(
  value: unknown,
  group: (typeof GROUPS)[number],
): { readonly kept?: readonly Entry[]; readonly found: readonly Found[] } {
  const at = `.credentials.${group.list}`;
  if (value === undefined) return { found: [] };
  if (!Array.isArray(value)) {
    return { found: [{ at, message: `"${group.list}" must be a list; the list is dropped` }] };
  }
  const repaired = value.map((entry, index) =>
    repairEntry(entry, group.identity, `${at}[${index}]`),
  );
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
