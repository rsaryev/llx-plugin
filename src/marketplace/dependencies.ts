import { error, type PluginIssue } from '../format/issues.ts';
import { isValidRange, satisfiesRange } from './semver.ts';
import type { NormalizedDependency } from './types.ts';

/**
 * A plugin's `dependencies` (plugins/dependencies.md, "Declare a dependency with a version
 * constraint"): an entry is `"name"`, `"name@marketplace"` or an object whose `name` (required),
 * `version` and `marketplace` are strings. The marketplace is the declaring plugin's own unless set;
 * the `version` is a node-semver range. This is the single owner of that reading; `loading` and the
 * entry validators import it. Checks of what is installed are in `checkInstalledDependency` and
 * `checkDependency`; tags and versions are in `dependency-tags.ts`.
 */

const PATH = 'dependencies';

/** `name@marketplace`, or `name` when the dependency has no marketplace (a plugin loaded from claude.ai names none). */
export const dependencyId = (dep: NormalizedDependency): string =>
  dep.marketplace === undefined ? dep.name : `${dep.name}@${dep.marketplace}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** What a dependency item says, before its defaults apply. */
interface Parts {
  readonly name: string;
  readonly marketplace?: string;
  readonly version?: string;
}

const isIssue = (value: unknown): value is PluginIssue =>
  isRecord(value) && 'severity' in value && 'message' in value;

/** An optional string field: absent is `undefined`; a value that is not a string, or an empty one where `empty` is false, is the issue. */
const stringField = (
  raw: Record<string, unknown>,
  key: 'name' | 'marketplace' | 'version',
  path: string,
): string | undefined | PluginIssue => {
  const value = raw[key];
  if (value === undefined) return undefined;
  const empty = key === 'version';
  if (typeof value === 'string' && (empty || value !== '')) return value;
  return error(`${path}.${key}`, `"${key}" must be ${empty ? 'a string' : 'a non-empty string'}`);
};

/** `name@marketplace` splits at the first `@`; plugin names hold no `@` (`PLUGIN_ID_PART`). */
const fromString = (text: string, path: string): Parts | PluginIssue => {
  const at = text.indexOf('@');
  if (at < 0)
    return text === '' ? error(path, 'A dependency name must not be empty') : { name: text };
  const name = text.slice(0, at);
  const marketplace = text.slice(at + 1);
  return name === '' || marketplace === ''
    ? error(path, `Dependency "${text}" must be "name" or "name@marketplace"`)
    : { name, marketplace };
};

const fromObject = (raw: Record<string, unknown>, path: string): Parts | PluginIssue => {
  const fields = [
    stringField(raw, 'name', path),
    stringField(raw, 'marketplace', path),
    stringField(raw, 'version', path),
  ];
  const [name, marketplace, version] = fields;
  const failed = fields.find(isIssue);
  if (failed !== undefined) return failed;
  if (name === undefined) return error(`${path}.name`, 'A dependency needs a "name"');
  if (isIssue(name)) return name;
  return {
    name,
    ...(typeof marketplace === 'string' ? { marketplace } : {}),
    ...(typeof version === 'string' ? { version } : {}),
  };
};

const readParts = (value: unknown, path: string): Parts | PluginIssue => {
  if (typeof value === 'string') return fromString(value, path);
  if (isRecord(value)) return fromObject(value, path);
  return error(path, 'A dependency must be a plugin name, "name@marketplace" or an object');
};

/**
 * Reads one `dependencies` item. Judgments (spec/judgments.md): an empty or blank `version` is no
 * constraint (node-semver reads "" as any version); a key other than the three is ignored.
 * `declaringMarketplace` is the marketplace of the plugin that declares it, or `undefined` for a
 * plugin that has none (loaded from claude.ai), whose bare names then have no marketplace.
 */
export function normalizeDependency(
  value: unknown,
  declaringMarketplace: string | undefined,
  path = `${PATH}[0]`,
): NormalizedDependency | PluginIssue {
  const parts = readParts(value, path);
  if (isIssue(parts)) return parts;
  const marketplace = parts.marketplace ?? declaringMarketplace;
  const range = parts.version?.trim() || undefined;
  const dep: NormalizedDependency = {
    name: parts.name,
    ...(marketplace === undefined ? {} : { marketplace }),
    ...(range === undefined ? {} : { range }),
  };
  if (range !== undefined && !isValidRange(range)) {
    return error(
      `${path}.version`,
      `Dependency "${dependencyId(dep)}" has an invalid version requirement: "${range}"`,
    );
  }
  return dep;
}

/** A dependency as the host found it: its version, whether it is enabled, and whether it is a `--plugin-dir` copy. */
export interface InstalledDependency {
  /** The tag's version for a tag-resolved copy, else the `version` of its `plugin.json`. */
  readonly version?: string;
  readonly enabled: boolean;
  /** A copy loaded with `--plugin-dir`: it satisfies the entry and no range is checked against it. */
  readonly local?: boolean;
  /** What the host calls the copy in messages (`my-dependency@inline`); the dependency's id when absent. */
  readonly id?: string;
}

const issueFor = (dep: NormalizedDependency, message: string): PluginIssue =>
  error(`${PATH}.${dependencyId(dep)}`, message);

/** The version a copy states, as the troubleshooting message shows it. */
const shown = (version: string | undefined): string => version ?? '(no version)';

/** The range check of one copy: no range, or a local copy, passes; no version satisfies no range. */
const rangeIssue = (
  dep: NormalizedDependency,
  copy: InstalledDependency,
): PluginIssue | undefined => {
  if (dep.range === undefined || copy.local === true) return undefined;
  if (copy.version !== undefined && satisfiesRange(copy.version, dep.range)) return undefined;
  return issueFor(
    dep,
    `Requires "${dependencyId(dep)}" ${dep.range}, installed ${shown(copy.version)}`,
  );
};

/**
 * Whether a declared dependency is met by its installed copy (plugins/troubleshooting.md,
 * "Dependency errors"): `Dependency "<dep>" is not installed`, `... is disabled`, and
 * `Requires "<dep>" <range>, installed <version>`. A `--plugin-dir` copy meets the entry whatever
 * its version.
 */
export function checkInstalledDependency(
  dep: NormalizedDependency,
  installed: InstalledDependency | undefined,
): PluginIssue | undefined {
  if (installed === undefined) {
    return issueFor(dep, `Dependency "${dependencyId(dep)}" is not installed`);
  }
  if (!installed.enabled) {
    return issueFor(
      dep,
      `Dependency "${installed.id ?? dependencyId(dep)}" is disabled — enable it or remove the dependency`,
    );
  }
  return rangeIssue(dep, installed);
}

/** The two places a dependency that names a marketplace can be found. */
export interface DependencyCopies {
  /** Installed from the marketplace the entry names. */
  readonly marketplace?: InstalledDependency;
  /** The claude.ai plugin of the same name, `<name>@synced`. */
  readonly claudeAi?: InstalledDependency;
}

const SYNCED_NOTE = (name: string): string =>
  `"${name}@synced" is loaded from your claude.ai account but meets a marketplace dependency only for other claude.ai plugins`;

/** A claude.ai plugin meets the entry when it is enabled; a plugin that states no version passes the range. */
const claudeAiIssue = (
  dep: NormalizedDependency,
  copy: InstalledDependency,
): PluginIssue | undefined => {
  if (!copy.enabled) return checkInstalledDependency(dep, copy);
  return copy.version === undefined ? undefined : rangeIssue(dep, copy);
};

/**
 * Whether a dependency is met given both places it can be (plugins/dependencies.md, "Dependencies
 * when your plugin loads from claude.ai"). A plugin loaded from claude.ai (`loadsFromClaudeAi`) has
 * a dependency that names a marketplace met by the copy installed from it and enabled (its range
 * checked against that copy), or by an enabled claude.ai plugin of the same name (its range checked
 * against its version; one that states none passes). For any other plugin a claude.ai copy meets
 * nothing, and the `is not installed` message says so.
 */
export function checkDependency(
  dep: NormalizedDependency,
  found: DependencyCopies,
  loadsFromClaudeAi: boolean,
): PluginIssue | undefined {
  const fromMarketplace = checkInstalledDependency(dep, found.marketplace);
  if (fromMarketplace === undefined || found.claudeAi === undefined) return fromMarketplace;
  if (loadsFromClaudeAi) {
    const fromClaudeAi = claudeAiIssue(dep, found.claudeAi);
    return fromClaudeAi === undefined ? undefined : fromMarketplace;
  }
  return found.marketplace === undefined
    ? issueFor(dep, `${fromMarketplace.message}: ${SYNCED_NOTE(dep.name)}`)
    : fromMarketplace;
}
