import {
  OFFICIAL_NAMES,
  parsePluginSource,
  validateMarketplace,
  type PluginSource,
  type PluginSourceKind,
} from '../../format/marketplace/index.ts';
import { errorIn, inFile, warningIn, type ValidationIssue } from '../../format/validate/finding.ts';
import { checkPluginManifest } from '../../format/validate/plugin-manifest.ts';
import { isRecord } from '../../protocol/is-record.ts';
import type { PluginFiles } from '../../ports/index.ts';
import { readJson, invalidJsonSyntax } from '../../format/read-json.ts';
import { isLink } from './links.ts';
import { childOf, pluginPath } from './paths.ts';
import { claimIssues } from './plugin-target.ts';

const MARKETPLACE_FILE = '.claude-plugin/marketplace.json';
const ENTRY_MANIFEST = '.claude-plugin/plugin.json';

/** What an entry's own `plugin.json` turned out to be. */
type EntryManifest =
  | { readonly found: 'manifest'; readonly dir: string; readonly value: unknown }
  | { readonly found: 'unparsed'; readonly dir: string; readonly problem: string }
  | { readonly found: 'not-a-directory'; readonly dir: string }
  | { readonly found: 'linked'; readonly dir: string; readonly via: 'path' | 'file' }
  | { readonly found: 'none' };

/** The folder of a source inside the marketplace; the other kinds are read from elsewhere. */
const LOCAL_PATH: {
  readonly [K in PluginSourceKind]: (source: PluginSource) => string | undefined;
} = {
  relative: (source) => ('bare' in source ? pluginPath(source.path) : undefined),
  github: () => undefined,
  url: () => undefined,
  'git-subdir': () => undefined,
  npm: () => undefined,
  archive: () => undefined,
  command: () => undefined,
};

/** The local folder an entry's `source` names, as a `PluginFiles` path. */
function localDir(
  entry: unknown,
  index: number,
  pluginRoot: string | undefined,
): string | undefined {
  if (!isRecord(entry)) return undefined;
  const slot = {
    index,
    context: {},
    ...(pluginRoot === undefined ? {} : { pluginRoot }),
  };
  const read = parsePluginSource(entry.source, slot);
  return read.source === undefined ? undefined : LOCAL_PATH[read.source.kind](read.source);
}

async function readEntryManifest(
  files: PluginFiles,
  dir: string | undefined,
  signal?: AbortSignal,
): Promise<EntryManifest> {
  if (dir === undefined) return { found: 'none' };
  const stat = await files.stat(dir, signal);
  if (stat?.isFile === true) return { found: 'not-a-directory', dir };
  const path = childOf(dir, ENTRY_MANIFEST);
  for (const folder of [dir, childOf(dir, '.claude-plugin')]) {
    if (await isLink(files, folder, signal)) return { found: 'linked', dir, via: 'path' };
  }
  if (await isLink(files, path, signal)) return { found: 'linked', dir, via: 'file' };
  if (!(await files.exists(path, signal))) return { found: 'none' };
  const read = await readJson(files, path, signal);
  return 'value' in read
    ? { found: 'manifest', dir, value: read.value }
    : { found: 'unparsed', dir, problem: read.problem };
}

const FILE_LINK = `${ENTRY_MANIFEST} is a symlink or is not a regular file, so it was not validated. Install reads it anyway. Validate it separately.`;

const pathLink = (source: string): string =>
  `Local source "${source}" is or traverses a symlink, so ${ENTRY_MANIFEST} was not read — validation never follows one. Install dereferences symlinks that stay inside the marketplace, so this entry still loads. Validate the real path separately.`;

const prefixOf = (index: number): string => `plugins[${index}] plugin.json → `;

/** The reports of one entry's own manifest, prefixed with the entry as the oracle does. */
async function entryIssues(
  files: PluginFiles,
  index: number,
  manifest: EntryManifest,
  options: {
    readonly official: boolean;
    readonly source: string;
    readonly entryName?: string;
    readonly signal?: AbortSignal;
  },
): Promise<ValidationIssue[]> {
  const { signal } = options;
  const prefix = prefixOf(index);
  if (manifest.found === 'none') return [];
  if (manifest.found === 'linked') {
    const message = manifest.via === 'file' ? FILE_LINK : pathLink(options.source);
    return [warningIn(MARKETPLACE_FILE, `plugins[${index}].source`, message)];
  }
  if (manifest.found === 'not-a-directory') {
    const message = `A path component of ${childOf(manifest.dir, ENTRY_MANIFEST)} is not a directory, so the file cannot be read. The entry will fail to load at install time.`;
    return [errorIn(MARKETPLACE_FILE, `${prefix}file`, message)];
  }
  if (manifest.found === 'unparsed') {
    return [
      warningIn(
        MARKETPLACE_FILE,
        `plugins[${index}].source`,
        `Could not parse ${ENTRY_MANIFEST} for version cross-check: ${manifest.problem}`,
      ),
      errorIn(MARKETPLACE_FILE, `${prefix}json`, invalidJsonSyntax(manifest.problem)),
    ];
  }
  const checks = checkPluginManifest(manifest.value, {
    official: options.official,
    context: 'entry',
    ...(options.entryName === undefined ? {} : { entryName: options.entryName }),
  });
  const claimed = await claimIssues(files, checks.claims, {
    file: MARKETPLACE_FILE,
    dir: manifest.dir,
    ...(signal && { signal }),
  });
  return [
    ...inFile(MARKETPLACE_FILE, checks.findings, prefix),
    ...claimed.map((issue) => ({ ...issue, path: `${prefix}${issue.path}` })),
  ];
}

/**
 * The schema's own errors name their place with dots (`plugins.0.source`), the validator's checks
 * with brackets (`plugins[0].source`); the kit reads both through one reader, so a schema error is
 * recognised by its wording (oracle 2.1.319).
 */
const SCHEMA_ERROR =
  /^(?:Invalid input|Invalid string|Invalid key|Unrecognized key|Plugin name cannot contain spaces)/;

const dotted = (issue: ValidationIssue): ValidationIssue =>
  issue.severity === 'error' &&
  SCHEMA_ERROR.test(issue.message) &&
  issue.path.startsWith('plugins[')
    ? { ...issue, path: issue.path.replaceAll(/\[(\d+)\]/g, '.$1') }
    : issue;

/**
 * Whether the marketplace's own report puts a schema error on entry `index`: its manifest is then
 * not read. The name and source checks are made apart from the schema and do not stop it.
 */
const brokenEntry = (issues: readonly ValidationIssue[], index: number): boolean =>
  issues.some((issue) => {
    if (issue.severity !== 'error') return false;
    const own =
      issue.path.startsWith(`plugins[${index}]`) || issue.path.startsWith(`plugins.${index}.`);
    const apart = [
      `plugins[${index}].name`,
      `plugins[${index}].source`,
      `plugins.${index}.name`,
      `plugins.${index}.source`,
    ].some((own) => issue.path.startsWith(own));
    return own && !apart;
  });

export interface MarketplaceFolder {
  readonly issues: ValidationIssue[];
  /** The marketplace is one of Anthropic's own. */
  readonly official: boolean;
}

/** The text of an entry's field, when it is text. */
const textOf = (entry: unknown, key: string): string | undefined => {
  const value = isRecord(entry) ? entry[key] : undefined;
  return typeof value === 'string' ? value : undefined;
};

/** The entries of the file, each with the manifest its local folder holds. */
async function readEntryManifests(
  files: PluginFiles,
  raw: unknown,
  signal?: AbortSignal,
): Promise<{ entries: readonly unknown[]; manifests: EntryManifest[] }> {
  const entries = isRecord(raw) && Array.isArray(raw.plugins) ? raw.plugins : [];
  const metadata = isRecord(raw) && isRecord(raw.metadata) ? raw.metadata : {};
  const root = typeof metadata.pluginRoot === 'string' ? metadata.pluginRoot : undefined;
  const manifests = await Promise.all(
    entries.map((entry, index) => readEntryManifest(files, localDir(entry, index, root), signal)),
  );
  return { entries, manifests };
}

export async function validateMarketplaceFolder(
  files: PluginFiles,
  signal?: AbortSignal,
): Promise<MarketplaceFolder> {
  const read = await readJson(files, MARKETPLACE_FILE, signal);
  if ('problem' in read) {
    return {
      issues: [errorIn(MARKETPLACE_FILE, 'json', invalidJsonSyntax(read.problem))],
      official: false,
    };
  }
  const raw = read.value;
  const { entries, manifests } = await readEntryManifests(files, raw, signal);
  const found = new Map(
    manifests.flatMap((manifest, index) =>
      manifest.found === 'manifest' ? [[index, manifest.value] as const] : [],
    ),
  );
  const own = validateMarketplace(raw, { pluginManifests: found }).map((issue) =>
    dotted({ ...issue, file: MARKETPLACE_FILE }),
  );
  const official = isRecord(raw) && OFFICIAL_NAMES.some((name) => name === raw.name);
  const nested: ValidationIssue[] = [];
  for (const [index, manifest] of manifests.entries()) {
    if (brokenEntry(own, index)) continue;
    const entryName = textOf(entries[index], 'name');
    nested.push(
      ...(await entryIssues(files, index, manifest, {
        official,
        source: textOf(entries[index], 'source') ?? '',
        ...(entryName === undefined ? {} : { entryName }),
        ...(signal && { signal }),
      })),
    );
  }
  return { issues: [...own, ...nested], official };
}
