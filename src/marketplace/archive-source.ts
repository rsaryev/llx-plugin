import { error, type PluginIssue } from '../format/issues.ts';
import type { HttpClient } from '../ports/http-client.ts';
import type { ArchiveReader, ArchiveStats, Sha256 } from '../ports/marketplace.ts';
import { archiveStats, unsafeEntryIssue } from './archive-scan.ts';
import { archiveIntegrityMessage } from './install-failures.ts';
import { PLUGIN_CONTENT_DIRECTORIES } from './plugin-content.ts';
import { archiveUrlIssues } from './source-safety.ts';
import { downloadFollowing } from './http-download.ts';
import type { ArchiveFetchPlan, ArchiveLimits } from './types.ts';
import { withoutTrailingSlashes } from '../format/path-text.ts';

/**
 * Fetching an `archive` source (plugins/marketplace-reference.md, "archive plugin source";
 * plugins/host-marketplace.md, "Stay within the download limits for hosted files"): the download
 * goes through `HttpClient`, the digest through `Sha256`, the unzip is the host's (`ArchiveReader`
 * reports what the zip holds) and the kit judges every documented limit. A refusal is a
 * `PluginIssue`; nothing throws. `ArchiveReader.scan` lists the entries; the totals, the plugin root
 * and the paths and links that would leave the plugin directory are all judged here
 * (`archive-scan.ts`), before a host unzips anything.
 */

export interface ArchivePorts {
  readonly http: HttpClient;
  readonly sha256: Sha256;
  readonly archive: ArchiveReader;
}

/** The verified zip and where the plugin root is in it: `''` at the top, or the one directory down. */
export interface FetchedArchive {
  readonly bytes: Uint8Array;
  readonly stats: ArchiveStats;
  readonly root: string;
}

const issue = (path: string, message: string): PluginIssue => error(path, message);

/** "Every redirect target must use `https://` and can't point at a loopback, link-local, or cloud-metadata host." */
const refuseArchiveHop = (target: string): string | undefined => {
  const refused = archiveUrlIssues(target, 'source.url')[0];
  return refused === undefined ? undefined : `The redirect is refused: ${refused.message}`;
};

/** Downloads the zip (`downloadFollowing`); a body cut at the limit is refused. */
async function download(
  plan: ArchiveFetchPlan,
  http: HttpClient,
  signal: AbortSignal,
): Promise<Uint8Array | PluginIssue> {
  const { limits } = plan;
  const response = await downloadFollowing(
    {
      url: plan.url,
      headers: plan.headers,
      as: 'bytes',
      timeoutMs: limits.timeoutMs,
      maxBytes: limits.maxDownloadBytes,
      maxRedirects: limits.maxRedirects,
      refuseHop: refuseArchiveHop,
      path: 'source.url',
    },
    http,
    signal,
  );
  if ('severity' in response) return response;
  if (response.truncated) {
    return issue(
      'source.url',
      `The archive is larger than ${limits.maxDownloadBytes / (1024 * 1024)} MiB`,
    );
  }
  return response.bytes ?? issue('source.url', 'The server sent no body');
}

/** "When you set it, Claude Code refuses a download that doesn't match." Compared without regard to case. */
async function digestIssue(
  bytes: Uint8Array,
  plan: ArchiveFetchPlan,
  sha256: Sha256,
): Promise<PluginIssue | undefined> {
  const expected = plan.sha256;
  if (expected === undefined) return undefined;
  const actual = await sha256.hex(bytes);
  return actual.toLowerCase() === expected.toLowerCase()
    ? undefined
    : issue(
        'source.sha256',
        archiveIntegrityMessage(plan.url, expected.toLowerCase(), actual.toLowerCase()),
      );
}

/**
 * "The install fails when the zip exceeds any of these extraction limits." The ratio is against
 * the size of the zip the kit downloaded (`zipBytes`), never a size the host reports.
 */
function extractionIssue(
  stats: ArchiveStats,
  zipBytes: number,
  limits: ArchiveLimits,
): PluginIssue | undefined {
  const MIB = 1024 * 1024;
  const breaks: readonly (readonly [boolean, string])[] = [
    [
      stats.entries > limits.maxEntries,
      `The archive has more than ${limits.maxEntries} files and directories`,
    ],
    [
      stats.largestFileBytes > limits.maxFileBytes,
      `A file in the archive is larger than ${limits.maxFileBytes / MIB} MiB uncompressed`,
    ],
    [
      stats.uncompressedBytes > limits.maxUncompressedBytes,
      `The archive is larger than ${limits.maxUncompressedBytes / MIB} MiB uncompressed`,
    ],
    [
      stats.uncompressedBytes > limits.maxCompressionRatio * zipBytes,
      `The archive's content is more than ${limits.maxCompressionRatio} times the size of the zip`,
    ],
  ];
  const broken = breaks.find(([exceeded]) => exceeded);
  return broken === undefined ? undefined : issue('source', broken[1]);
}

/** The folder of resource forks macOS Finder adds beside what it zips: never the plugin (judgment). */
const FINDER_FORKS = '__MACOSX';

/** "The plugin root may be at the top of the zip or one directory down": at the top when plugin content is there, else the one wrapping directory. */
function rootOf(topLevel: readonly string[]): string | PluginIssue {
  const names = topLevel.map(withoutTrailingSlashes).filter((name) => name !== FINDER_FORKS);
  if (names.some((name) => PLUGIN_CONTENT_DIRECTORIES.includes(name))) return '';
  const [only] = names;
  if (names.length === 1 && only !== undefined) return only;
  return issue('source', 'The archive has no plugin root at its top or one directory down');
}

/** Downloads the archive and judges it; the verified zip and its plugin root, or the issue that refuses it. */
export async function fetchArchive(
  plan: ArchiveFetchPlan,
  ports: ArchivePorts,
  { signal }: { readonly signal: AbortSignal },
): Promise<FetchedArchive | PluginIssue> {
  const blocked = archiveUrlIssues(plan.url, 'source.url')[0];
  if (blocked !== undefined) return blocked;
  const bytes = await download(plan, ports.http, signal);
  if (!(bytes instanceof Uint8Array)) return bytes;
  const mismatch = await digestIssue(bytes, plan, ports.sha256);
  if (mismatch !== undefined) return mismatch;
  const scan = await ports.archive.scan(bytes, signal);
  if ('failure' in scan) return issue('source', `The archive cannot be read: ${scan.message}`);
  const stats = archiveStats(scan, bytes.length);
  const oversized = extractionIssue(stats, bytes.length, plan.limits);
  if (oversized !== undefined) return oversized;
  const root = rootOf(stats.topLevel);
  if (typeof root !== 'string') return root;
  return unsafeEntryIssue(scan, root) ?? { bytes, stats, root };
}
