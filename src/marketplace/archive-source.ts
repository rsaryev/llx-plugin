import { error, type PluginIssue } from '../format/issues.ts';
import type { HttpClient, HttpFailure, HttpResponse } from '../ports/http-client.ts';
import type { ArchiveReader, ArchiveStats, Sha256 } from '../ports/marketplace.ts';
import { PLUGIN_CONTENT_DIRECTORIES } from './plugin-content.ts';
import { archiveUrlIssues } from './source-safety.ts';
import type { ArchiveFetchPlan, ArchiveLimits } from './types.ts';

/**
 * Fetching an `archive` source (plugins/marketplace-reference.md, "archive plugin source";
 * plugins/host-marketplace.md, "Stay within the download limits for hosted files"): the download
 * goes through `HttpClient`, the digest through `Sha256`, the unzip is the host's (`ArchiveReader`
 * reports what the zip holds) and the kit judges every documented limit. A refusal is a
 * `PluginIssue`; nothing throws.
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

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

const issue = (path: string, message: string): PluginIssue => error(path, message);

const FAILURES: { readonly [F in HttpFailure['failure']]: string } = {
  connection: 'The download failed to connect',
  timeout: 'The server did not respond in time',
  aborted: 'The download was aborted',
};

const originOf = (url: string): string | undefined => {
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
};

/** The next URL of a redirect, or the issue that refuses it (at most five; each target https and not a blocked host). */
function followRedirect(
  response: HttpResponse,
  from: string,
  followed: number,
  limits: ArchiveLimits,
): string | PluginIssue {
  if (followed >= limits.maxRedirects) {
    return issue(
      'source.url',
      `The download was redirected more than ${limits.maxRedirects} times`,
    );
  }
  const location = response.headers.location;
  if (location === undefined)
    return issue('source.url', 'The server redirected without a location');
  let target: string;
  try {
    target = new URL(location, from).href;
  } catch {
    return issue('source.url', `The redirect target "${location}" is not a URL`);
  }
  const refused = archiveUrlIssues(target, 'source.url')[0];
  return refused === undefined
    ? target
    : issue('source.url', `The redirect is refused: ${refused.message}`);
}

/** One response: the zip, or the next hop, or the issue. */
function judge(
  response: HttpResponse,
  limits: ArchiveLimits,
): Uint8Array | 'redirect' | PluginIssue {
  if (REDIRECTS.has(response.status)) return 'redirect';
  if (response.status < 200 || response.status > 299) {
    return issue('source.url', `The server answered ${response.status}`);
  }
  if (response.truncated) {
    return issue(
      'source.url',
      `The archive is larger than ${limits.maxDownloadBytes / (1024 * 1024)} MiB`,
    );
  }
  return response.bytes ?? issue('source.url', 'The server sent no body');
}

/**
 * Downloads the zip, following redirects by hand so each hop is judged. A request sent to another
 * origin carries none of the configured headers, and neither does any request after it.
 */
async function download(
  plan: ArchiveFetchPlan,
  http: HttpClient,
  signal: AbortSignal,
): Promise<Uint8Array | PluginIssue> {
  const start = originOf(plan.url);
  let url = plan.url;
  let sendHeaders = true;
  for (let followed = 0; ; followed += 1) {
    sendHeaders = sendHeaders && originOf(url) === start;
    const response = await http.request({
      method: 'GET',
      url,
      headers: sendHeaders ? plan.headers : {},
      as: 'bytes',
      timeoutMs: plan.limits.timeoutMs,
      maxBytes: plan.limits.maxDownloadBytes,
      redirect: 'manual',
      signal,
    });
    if ('failure' in response) return issue('source.url', FAILURES[response.failure]);
    const verdict = judge(response, plan.limits);
    if (verdict !== 'redirect') return verdict;
    const next = followRedirect(response, url, followed, plan.limits);
    if (typeof next !== 'string') return next;
    url = next;
  }
}

/** "When you set it, Claude Code refuses a download that doesn't match." Compared without regard to case. */
async function digestIssue(
  bytes: Uint8Array,
  expected: string | undefined,
  sha256: Sha256,
): Promise<PluginIssue | undefined> {
  if (expected === undefined) return undefined;
  const actual = await sha256.hex(bytes);
  return actual.toLowerCase() === expected.toLowerCase()
    ? undefined
    : issue(
        'source.sha256',
        `The archive does not match its sha256: expected ${expected.toLowerCase()}, got ${actual.toLowerCase()}`,
      );
}

/** "The install fails when the zip exceeds any of these extraction limits." */
function extractionIssue(stats: ArchiveStats, limits: ArchiveLimits): PluginIssue | undefined {
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
      stats.uncompressedBytes > limits.maxCompressionRatio * stats.compressedBytes,
      `The archive's content is more than ${limits.maxCompressionRatio} times the size of the zip`,
    ],
  ];
  const broken = breaks.find(([exceeded]) => exceeded);
  return broken === undefined ? undefined : issue('source', broken[1]);
}

const bare = (name: string): string => name.replace(/\/+$/, '');

/** "The plugin root may be at the top of the zip or one directory down": at the top when plugin content is there, else the one wrapping directory. */
function rootOf(topLevel: readonly string[]): string | PluginIssue {
  const names = topLevel.map(bare);
  if (names.some((name) => PLUGIN_CONTENT_DIRECTORIES.includes(name))) return '';
  const [only] = names;
  if (names.length === 1 && only !== undefined) return only;
  return issue('source', 'The archive has no plugin root at its top or one directory down');
}

/** Downloads the archive and judges it; the verified zip and its plugin root, or the issue that refuses it. */
export async function fetchArchive(
  plan: ArchiveFetchPlan,
  ports: ArchivePorts,
  signal: AbortSignal,
): Promise<FetchedArchive | PluginIssue> {
  const blocked = archiveUrlIssues(plan.url, 'source.url')[0];
  if (blocked !== undefined) return blocked;
  const bytes = await download(plan, ports.http, signal);
  if (!(bytes instanceof Uint8Array)) return bytes;
  const mismatch = await digestIssue(bytes, plan.sha256, ports.sha256);
  if (mismatch !== undefined) return mismatch;
  const stats = await ports.archive.stats(bytes, signal);
  if ('failure' in stats) return issue('source', `The archive cannot be read: ${stats.message}`);
  const oversized = extractionIssue(stats, plan.limits);
  if (oversized !== undefined) return oversized;
  const root = rootOf(stats.topLevel);
  return typeof root === 'string' ? { bytes, stats, root } : root;
}
