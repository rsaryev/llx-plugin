import { errorAt, errorIn, inFile, type ValidationIssue } from '../../format/validate/finding.ts';
import type { PathClaim } from '../../format/validate/path-claims.ts';
import {
  checkPluginManifest,
  type ManifestOptions,
} from '../../format/validate/plugin-manifest.ts';
import { isRecord } from '../../protocol/is-record.ts';
import type { PluginFiles } from '../../ports/index.ts';
import { readJson, invalidJsonSyntax } from '../../format/read-json.ts';
import { pluginContents } from './plugin-contents.ts';
import { childOf, pluginPath } from './paths.ts';

export const MANIFEST_FILE = '.claude-plugin/plugin.json';

const NOT_FOUND = 'The runtime loader will report this as a load failure.';
const SKIPPED =
  'The plugin loader skips a missing MCP servers file without reporting it, so none of its servers will load.';

/** What a path claim found on disk, as the finding it earns, if any. */
async function claimIssue(
  files: PluginFiles,
  claim: PathClaim,
  dir: string,
  signal?: AbortSignal,
): Promise<string | undefined> {
  const stat = await files.stat(childOf(dir, pluginPath(claim.value)), signal);
  if (stat === undefined) {
    return `Path not found: ${claim.value}. ${claim.skippedWhenMissing ? SKIPPED : NOT_FOUND}`;
  }
  if (!claim.directory || !stat.isFile) return undefined;
  const parent = claim.value.replace(/\/SKILL\.md$/, '');
  const prefix = 'Path is a file; skills entries must be directories containing SKILL.md';
  return parent === claim.value
    ? `${prefix}: ${claim.value}`
    : `${prefix} — point to the parent directory '${parent}' instead: ${claim.value}`;
}

/** Where a manifest's claims are checked and reported. */
export interface ClaimSite {
  /** The file the findings are about. */
  readonly file: string;
  /** The plugin folder the claimed paths are relative to; default the folder validated. */
  readonly dir?: string;
  readonly signal?: AbortSignal;
}

/** The existence findings of a manifest's path claims, in claim order. */
export async function claimIssues(
  files: PluginFiles,
  claims: readonly PathClaim[],
  site: ClaimSite,
): Promise<ValidationIssue[]> {
  const found: ValidationIssue[] = [];
  for (const claim of claims) {
    const message = await claimIssue(files, claim, site.dir ?? '.', site.signal);
    if (message !== undefined) found.push(errorIn(site.file, claim.path, message));
  }
  return found;
}

/** Validates the plugin whose manifest is `.claude-plugin/plugin.json`: the manifest, then its contents. */
export async function validatePluginFolder(
  files: PluginFiles,
  options: ManifestOptions = {},
  signal?: AbortSignal,
): Promise<ValidationIssue[]> {
  const read = await readJson(files, MANIFEST_FILE, signal);
  if ('problem' in read) {
    return [errorIn(MANIFEST_FILE, 'json', invalidJsonSyntax(read.problem))];
  }
  if (!isRecord(read.value))
    return inFile(MANIFEST_FILE, [errorAt('root', 'manifest must be an object')]);
  const checks = checkPluginManifest(read.value, options);
  return [
    ...inFile(MANIFEST_FILE, checks.findings),
    ...(await claimIssues(files, checks.claims, {
      file: MANIFEST_FILE,
      ...(signal && { signal }),
    })),
    ...(await pluginContents(
      files,
      { manifest: read.value, file: MANIFEST_FILE, inline: checks.inline },
      signal,
    )),
  ];
}
