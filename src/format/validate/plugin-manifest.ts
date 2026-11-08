import { errorAt, warningAt, type Finding } from './finding.ts';
import {
  fieldFindings,
  looseObjectFindings,
  missingName,
  PLUGIN_KEYS,
  SUGGESTED_KEYS,
} from './plugin-fields.ts';
import { nameFindings, type NameOptions } from './plugin-name.ts';
import { isPathKey, PATH_SHAPES, pathShapeFindings } from './plugin-paths.ts';
import { claimsOf, type PathClaim } from './path-claims.ts';
import { inlineFindings } from './mcp-check.ts';
import { hooksMapFindings } from './hooks-check.ts';
import { isRecord } from './received.ts';
import { unknownFieldFinding } from './unknown-fields.ts';

/**
 * `claude plugin validate` on a parsed `plugin.json` (oracle 2.1.319): what is wrong with each
 * key's type, the name, the keys it does not know, and what is missing. Whether the paths it
 * names exist is for the caller, which has the files: `claims` lists them.
 *
 * The validator parses the manifest against its schema first. A manifest that fails it is still
 * checked for unknown keys and paths, but not for what is missing or how its name reads, and the
 * hooks and MCP servers written inline are not read at all: `inline` is empty then.
 */
export interface ManifestChecks {
  readonly findings: readonly Finding[];
  /** What the inline `hooks` and `mcpServers` hold; for the plugin's own file, not for a marketplace entry. */
  readonly inline: readonly Finding[];
  readonly claims: readonly PathClaim[];
}

export interface ManifestOptions extends NameOptions {
  /** The name of the marketplace entry this manifest belongs to: a name it already reported is not reported twice. */
  readonly entryName?: string;
}

/** Fields that are advised on when missing or empty (oracle 2.1.319). */
const RECOMMENDED = [
  ['version', 'No version specified. Consider adding a version following semver (e.g., "1.0.0")'],
  [
    'description',
    'No description provided. Adding a description helps users understand what your plugin does',
  ],
  [
    'author',
    'No author information provided. Consider adding author details for plugin attribution',
  ],
] as const;

const NO_LONGER_READ =
  "'capabilities' is no longer read: what a hooks module hooks and calls on $ is read from its source and listed under its hooks.json below. Delete the field.";

const EXPERIMENTAL_KEYS = ['themes', 'monitors', 'evals'] as const;
const MOVED_UNDER_EXPERIMENTAL = ['themes', 'monitors'] as const;

const movedWarning = (key: string): Finding =>
  warningAt(
    key,
    `'${key}' is an experimental component; declare it under 'experimental.${key}' instead of at the top level. Top-level still loads for now but will be removed in a future release.`,
  );

function experimentalFindings(experimental: unknown): Finding[] {
  if (!isRecord(experimental)) return [];
  return Object.entries(experimental).flatMap(([key, value]) => {
    if (!EXPERIMENTAL_KEYS.some((known) => known === key)) {
      return [unknownFieldFinding(key, EXPERIMENTAL_KEYS, `experimental.${key}`)];
    }
    return isPathKey(key) && key !== 'types'
      ? pathShapeFindings(`experimental.${key}`, PATH_SHAPES[key], value)
      : [];
  });
}

const unknownKeys = (manifest: Readonly<Record<string, unknown>>): Finding[] =>
  Object.keys(manifest)
    .filter((key) => !PLUGIN_KEYS.includes(key) && !isPathKey(key) && key !== 'capabilities')
    .map((key) => unknownFieldFinding(key, SUGGESTED_KEYS));

function advice(manifest: Readonly<Record<string, unknown>>): Finding[] {
  const found: Finding[] = [];
  if (manifest.capabilities !== undefined) found.push(warningAt('capabilities', NO_LONGER_READ));
  for (const key of MOVED_UNDER_EXPERIMENTAL) {
    if (manifest[key] !== undefined) found.push(movedWarning(key));
  }
  return found;
}

/** The `userConfig` options (and each channel's) a server may reference as `${user_config.*}`. */
export function declaredOptions(manifest: Readonly<Record<string, unknown>>): ReadonlySet<string> {
  const keys = (value: unknown): string[] => (isRecord(value) ? Object.keys(value) : []);
  const channels = Array.isArray(manifest.channels) ? manifest.channels : [];
  return new Set([
    ...keys(manifest.userConfig),
    ...channels.flatMap((channel) => (isRecord(channel) ? keys(channel.userConfig) : [])),
  ]);
}

const GUARDED_ERROR = (found: readonly Finding[]): boolean =>
  found.some((issue) => issue.severity === 'error');

/** What the inline `hooks` and `mcpServers` hold: hooks as the oracle reads them (no shell advice), servers for references and cleartext URLs. */
function inlineChecks(manifest: Readonly<Record<string, unknown>>): Finding[] {
  const { hooks, mcpServers } = manifest;
  const maps = Array.isArray(hooks)
    ? hooks.map((entry, index) => [entry, `hooks.${index}`] as const)
    : [[hooks, 'hooks'] as const];
  const fromHooks = maps.flatMap(([map, prefix]) =>
    isRecord(map) ? hooksMapFindings(map, { prefix, advice: false }) : [],
  );
  const refused = GUARDED_ERROR(fromHooks) ? [errorAt('hooks', 'Invalid input')] : [];
  const servers = isRecord(mcpServers) ? inlineFindings(mcpServers, declaredOptions(manifest)) : [];
  return [...fromHooks, ...refused, ...servers];
}

export function checkPluginManifest(raw: unknown, options: ManifestOptions = {}): ManifestChecks {
  if (!isRecord(raw)) {
    return { findings: [errorAt('root', 'manifest must be an object')], inline: [], claims: [] };
  }
  const claimed = claimsOf(raw);
  const schema = [
    ...missingName(raw),
    ...fieldFindings(raw),
    ...experimentalFindings(raw.experimental),
  ];
  const sound = schema.length === 0;
  const name =
    typeof raw.name === 'string'
      ? nameFindings(raw.name, options, raw.name === options.entryName)
      : { blocking: [], advice: [] };
  const findings = [
    ...name.blocking,
    ...schema,
    ...claimed.findings,
    ...(sound ? name.advice : []),
    ...unknownKeys(raw),
    ...looseObjectFindings(raw),
    ...advice(raw),
    ...(sound
      ? RECOMMENDED.filter(([key]) => raw[key] === undefined || raw[key] === '').map(
          ([key, message]) => warningAt(key, message),
        )
      : []),
  ];
  return { findings, inline: sound ? inlineChecks(raw) : [], claims: claimed.claims };
}
