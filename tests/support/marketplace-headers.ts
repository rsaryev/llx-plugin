import type { HeaderLayer, HeadersSetting } from '../../src/marketplace/header-policy.ts';
import { urlSourceLayer, entryLayer } from '../../src/marketplace/download-headers.ts';
import type { DownloadHeaderPorts } from '../../src/marketplace/download-headers.ts';
import { helperCache } from '../../src/marketplace/header-helper.ts';
import type { PluginIssue } from '../../src/format/issues.ts';
import type { HeaderMap, ResolvedHeaders } from '../../src/marketplace/types.ts';
import { fixedClock, fakeEnvironment, locations, scriptedRunner } from './ports.ts';
import type { RunnerReply } from './ports.ts';

/** Helpers of the download-header tests: layers, settings and the ports a helper runs through. */
const MARKETPLACE_URL = 'https://plugins.example.com/marketplace.json';
export const ARCHIVE_URL = 'https://plugins.example.com/p/formatter-2.0.0.zip';
export const signal = new AbortController().signal;

export const setting = (rest: Partial<HeadersSetting> = {}): HeadersSetting => ({
  platform: 'posix',
  folderTrusted: false,
  settingsApproved: false,
  managedMarketplace: false,
  ...rest,
});

type SourceInput = Parameters<typeof urlSourceLayer>[0];
export const sourceLayer = (
  rest: Partial<SourceInput> = {},
  origin: HeaderLayer['origin'] = 'user',
): HeaderLayer =>
  urlSourceLayer({ kind: 'url', url: MARKETPLACE_URL, name: 'acme', ...rest }, origin);

type EntryInput = Parameters<typeof entryLayer>[0];
type EntryDeclaration = Parameters<typeof entryLayer>[2];
export const layerOfEntry = (
  rest: Partial<EntryInput> = {},
  declared: Partial<EntryDeclaration> = {},
): HeaderLayer =>
  entryLayer({ name: 'formatter', ...rest }, ARCHIVE_URL, {
    origin: 'catalog',
    operation: 'install',
    accepted: { command: rest.headersHelper ?? '', archiveUrl: ARCHIVE_URL },
    ...declared,
  });

export function portsWith(
  replies: readonly RunnerReply[],
  options: { env?: Readonly<Record<string, string>>; home?: string } = {},
) {
  const runner = scriptedRunner(...replies);
  const clock = fixedClock(1_000);
  const ports: DownloadHeaderPorts = {
    runner,
    environment: fakeEnvironment(options.env ?? { PATH: '/bin', HOME: '/home/user' }),
    locations: locations({ home: options.home ?? '/home/user' }),
    cache: helperCache(clock),
  };
  return { ports, runner, clock };
}

export const prints = (headers: unknown): RunnerReply => ({ stdout: JSON.stringify(headers) });

/** The issue a resolution refused with; the test is wrong when it resolved. */
export const issueOf = (value: ResolvedHeaders | PluginIssue): PluginIssue => {
  if (!('severity' in value)) throw new Error('expected an issue');
  return value;
};

/** The headers a resolution produced; the test is wrong when it was refused. */
export const headersOf = (value: ResolvedHeaders | PluginIssue): HeaderMap => {
  if ('severity' in value) throw new Error(`expected headers, got: ${value.message}`);
  return value.headers;
};
