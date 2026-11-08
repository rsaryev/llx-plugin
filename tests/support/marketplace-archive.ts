import type { PluginIssue } from '../../src/format/issues.ts';
import { fetchArchive, type ArchivePorts } from '../../src/marketplace/archive-source.ts';
import { ARCHIVE_LIMITS } from '../../src/marketplace/fetch-plan.ts';
import type { ArchiveFetchPlan } from '../../src/marketplace/types.ts';
import type { ArchiveFailure, ArchiveStats } from '../../src/ports/marketplace.ts';
import type { HttpReply } from './http.ts';
import { fakeArchive, fakeSha256 } from './marketplace-ports.ts';
import { recordingHttp } from './ports.ts';

/** Helpers of the `archive` source tests: a fetch through fakes of every port it takes. */
export const URL_0 = 'https://artifacts.example.com/formatter-2.0.0.zip';
export const DIGEST = '6bfa50e3d2e00c052b46abe51fff89346ac803e45771f76dcf6df1ab74cca5e1';
const signal = new AbortController().signal;
export const ZIP = new Uint8Array([80, 75, 3, 4]);
export const MIB = 1024 * 1024;

export const stats = (rest: Partial<ArchiveStats> = {}): ArchiveStats => ({
  entries: 10,
  largestFileBytes: 1000,
  uncompressedBytes: 4000,
  compressedBytes: 2000,
  topLevel: ['.claude-plugin', 'skills'],
  ...rest,
});

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
    stats?: ArchiveStats | ArchiveFailure;
    digest?: string;
  } = {},
) {
  const http = recordingHttp(...replies);
  const sha256 = fakeSha256(options.digest ?? DIGEST);
  const archive = fakeArchive(options.stats ?? stats());
  const ports: ArchivePorts = { http, sha256, archive };
  return { result: fetchArchive(plan(options.plan), ports, signal), http, sha256, archive };
}

export async function refusal(run: ReturnType<typeof fetchWith>): Promise<PluginIssue> {
  const value = await run.result;
  if (!('severity' in value)) throw new Error('expected an issue');
  return value;
}

/** Stats of an archive whose single file is `bytes` big and stored as it is. */
export const oneFile = (bytes: number): ArchiveStats =>
  stats({ largestFileBytes: bytes, uncompressedBytes: bytes, compressedBytes: bytes });

/** Stats of an archive that holds `bytes` uncompressed in small files, stored as they are. */
export const totalOf = (bytes: number): ArchiveStats =>
  stats({ uncompressedBytes: bytes, compressedBytes: bytes, largestFileBytes: 1 });

/** Stats of a 1000-byte zip that holds `bytes` uncompressed. */
export const ratioOf = (bytes: number): ArchiveStats =>
  stats({ compressedBytes: 1000, uncompressedBytes: bytes, largestFileBytes: 1 });
