import type { PluginIssue } from '../../src/format/issues.ts';
import { fetchArchive, type ArchivePorts } from '../../src/marketplace/archive-source.ts';
import { ARCHIVE_LIMITS } from '../../src/marketplace/fetch-plan.ts';
import type { ArchiveFetchPlan } from '../../src/marketplace/types.ts';
import type { ArchiveEntry, ArchiveFailure, ArchiveScan } from '../../src/ports/marketplace.ts';
import type { HttpReply } from './ports.ts';
import { fakeArchive, fakeSha256 } from './marketplace-ports.ts';
import { recordingHttp } from './ports.ts';

/** Helpers of the `archive` source tests: a fetch through fakes of every port it takes. */
export const URL_0 = 'https://artifacts.example.com/formatter-2.0.0.zip';
export const DIGEST = '6bfa50e3d2e00c052b46abe51fff89346ac803e45771f76dcf6df1ab74cca5e1';
const signal = new AbortController().signal;
export const ZIP = new Uint8Array([80, 75, 3, 4]);
export const MIB = 1024 * 1024;

/** What a test says of a zip: its top-level names, how many entries it lists and the sizes of its files. */
interface Shape {
  readonly topLevel?: readonly string[];
  readonly entries?: number;
  readonly sizes?: readonly number[];
}

/**
 * The scan of a zip of that shape: each top-level name a directory entry, the files below the first
 * of them, padded with empty files up to `entries`. The totals are the scan's, nothing is reported.
 */
export function stats({
  topLevel = ['.claude-plugin', 'skills'],
  sizes = [50, 50],
  entries,
}: Shape = {}): ArchiveScan {
  const [first] = topLevel;
  if (first === undefined) return { entries: [] };
  const directories: ArchiveEntry[] = topLevel.map((name) => ({
    path: `${name.replace(/\/+$/, '')}/`,
    size: 0,
    isSymlink: false,
  }));
  const wanted = Math.max(entries ?? 0, directories.length + sizes.length);
  const files: ArchiveEntry[] = Array.from({ length: wanted - directories.length }, (_, index) => ({
    path: `${first.replace(/\/+$/, '')}/f${index}`,
    size: sizes[index] ?? 0,
    isSymlink: false,
  }));
  return { entries: [...directories, ...files] };
}

const plan = (rest: Partial<ArchiveFetchPlan> = {}): ArchiveFetchPlan => ({
  kind: 'archive',
  url: URL_0,
  limits: ARCHIVE_LIMITS,
  headers: {},
  rootDepth: 'top-or-one-down',
  ...rest,
});

export const ok = { status: 200, bytes: ZIP } as const;
export const moved = (location: string, status = 302): HttpReply => ({
  status,
  headers: { location },
});

export function fetchWith(
  replies: readonly HttpReply[],
  options: {
    plan?: Partial<ArchiveFetchPlan>;
    scan?: ArchiveScan | ArchiveFailure;
    digest?: string;
  } = {},
) {
  const http = recordingHttp(...replies);
  const sha256 = fakeSha256(options.digest ?? DIGEST);
  const archive = fakeArchive(options.scan ?? stats());
  const ports: ArchivePorts = { http, sha256, archive };
  return { result: fetchArchive(plan(options.plan), ports, { signal }), http, sha256, archive };
}

export async function refusal(run: ReturnType<typeof fetchWith>): Promise<PluginIssue> {
  const value = await run.result;
  if (!('severity' in value)) throw new Error('expected an issue');
  return value;
}

/** A reply whose zip is exactly `length` bytes: the size the compression ratio is judged against. */
export const zipOf = (length: number): HttpReply => ({
  status: 200,
  bytes: new Uint8Array(length),
});

const HALF_GIB = 512 * MIB;

/** A zip whose single file is `bytes` big. */
export const oneFile = (bytes: number): ArchiveScan => stats({ sizes: [bytes] });

/** A zip that holds `bytes` uncompressed in files of at most 512 MiB each. */
export const totalOf = (bytes: number): ArchiveScan =>
  stats({
    sizes: Array.from({ length: Math.ceil(bytes / HALF_GIB) }, (_, index) =>
      Math.min(HALF_GIB, bytes - index * HALF_GIB),
    ),
  });

/** A zip that holds `bytes` uncompressed, in one file. */
export const ratioOf = (bytes: number): ArchiveScan => stats({ sizes: [bytes] });

/** The smallest zip the compression ratio lets `archive` hold, so a size-limit test reaches its own limit. */
export const zipFor = (archive: ArchiveScan): HttpReply =>
  zipOf(
    Math.max(
      ZIP.length,
      Math.ceil(
        archive.entries.reduce((total, one) => total + one.size, 0) /
          ARCHIVE_LIMITS.maxCompressionRatio,
      ),
    ),
  );
