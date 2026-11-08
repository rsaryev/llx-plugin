import { error, warning, type PluginIssue } from '../format/issues.ts';
import type { Settings } from '../protocol/official.ts';
import { MARKETPLACE_KEY_ALIASES, POLICY_KEYS, type PolicyKey } from '../protocol/settings-keys.ts';
import { KEY_SPECS, admits, scopeCarries } from './key-spec.ts';
import type { PolicyScope, PolicyLayer } from './layers.ts';
import { REPAIRS } from './repair.ts';
import { isRecord } from './record.ts';
import { where } from './repair-support.ts';

/**
 * Turns the JSON of one settings source into a layer every resolver can trust: aliases rewritten to
 * their canonical key, a key the source may not carry dropped with a warning, an unreadable value
 * repaired as the docs say (managed-settings.md, "Find entries Claude Code dropped"). It never
 * throws; every drop and repair is a `PluginIssue`.
 */

/** The policy tier: an unreadable restrictive value there fails closed (managed-settings.md). */
const FAILS_CLOSED: { readonly [S in PolicyScope]: boolean } = {
  managed: true,
  parent: true,
  flag: false,
  local: false,
  project: false,
  addDir: false,
  user: false,
};

/** How a report names a source (settings.md, "Settings files and who they affect"). */
const SCOPE_LABEL: { readonly [S in PolicyScope]: string } = {
  managed: 'managed settings',
  parent: 'parent settings',
  flag: '--settings',
  local: 'project local settings',
  project: 'shared project settings',
  addDir: 'an --add-dir directory',
  user: 'user settings',
};

const POLICY_KEY_NAMES: ReadonlySet<string> = new Set(POLICY_KEYS);
const isPolicyKey = (name: string): name is PolicyKey => POLICY_KEY_NAMES.has(name);

const ALIASES: ReadonlyMap<string, PolicyKey> = new Map(Object.entries(MARKETPLACE_KEY_ALIASES));

/**
 * The keys of a source with each alias written as its canonical key; when both spellings are in
 * one file the canonical value is used and the alias ignored (settings-reference.md, "Marketplace
 * key aliases").
 */
function canonicalEntries(raw: Readonly<Record<string, unknown>>): [string, unknown][] {
  return Object.entries(raw).flatMap(([name, value]): [string, unknown][] => {
    const canonical = ALIASES.get(name);
    if (canonical === undefined) return [[name, value]];
    return raw[canonical] === undefined || raw[canonical] === null ? [[canonical, value]] : [];
  });
}

interface Read {
  readonly entry?: readonly [string, unknown] | undefined;
  readonly issues: readonly PluginIssue[];
}

function readPolicyKey(scope: PolicyScope, key: PolicyKey, value: unknown): Read {
  const at = { key, scope, closed: FAILS_CLOSED[scope] };
  if (!admits(key, scope, value)) {
    return {
      issues: [
        warning(where(at), `"${key}" is not read from ${SCOPE_LABEL[scope]}; the key is ignored`),
      ],
    };
  }
  const repaired = REPAIRS[KEY_SPECS[key].repair](value, at);
  return {
    entry: repaired.value === undefined ? undefined : [key, repaired.value],
    issues: repaired.issues,
  };
}

function readEntry(scope: PolicyScope, name: string, value: unknown): Read {
  // A `null` removes the key (managed-settings.md, "Keys that fail closed").
  if (isPolicyKey(name)) return value === null ? { issues: [] } : readPolicyKey(scope, name, value);
  return { entry: scopeCarries(scope, name) ? [name, value] : undefined, issues: [] };
}

/** An absent source (`undefined`) is an empty layer; a document that is no JSON object is skipped. */
export function readSettingsLayer(
  scope: PolicyScope,
  raw: unknown,
): { layer: PolicyLayer; issues: readonly PluginIssue[] } {
  const empty: Settings = {};
  if (raw === undefined) return { layer: { scope, settings: empty }, issues: [] };
  if (!isRecord(raw)) {
    const found = FAILS_CLOSED[scope]
      ? error(
          `${scope}:`,
          'Managed settings document could not be parsed as a JSON object; none of its settings are in effect. Fix or remove it.',
        )
      : warning(
          `${scope}:`,
          `The settings in ${SCOPE_LABEL[scope]} are not a JSON object and are skipped`,
        );
    return { layer: { scope, settings: empty }, issues: [found] };
  }
  const reads = canonicalEntries(raw).map(([name, value]) => readEntry(scope, name, value));
  const entries = reads.flatMap((read) => (read.entry === undefined ? [] : [read.entry]));
  // `Object.fromEntries` defines own properties, so a JSON-parsed `__proto__` key stays a key.
  const settings: Settings = Object.fromEntries(entries);
  return { layer: { scope, settings }, issues: reads.flatMap((read) => read.issues) };
}
