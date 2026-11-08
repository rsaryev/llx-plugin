import { error, type PluginIssue } from '../format/issues.ts';
import {
  helperAllowed,
  filtersRouting,
  type HeaderLayer,
  type HeaderOrigin,
  type HelperEffect,
  type HelperVerdict,
  type HeadersSetting,
  type PluginOperation,
} from './header-policy.ts';
import { runHeadersHelper, type HelperCache, type HeadersHelperPorts } from './header-helper.ts';
import { mergeHeaders, normalizeHeaders, withoutRoutingHeaders } from './header-map.ts';
import type { HeaderMap, ResolvedHeaders } from './types.ts';

/**
 * The headers of a download (plugins/host-marketplace.md, "Authenticate archive downloads"; "Stay
 * within the download limits"; marketplace-reference.md, "Fields by type", "Plugin entries"):
 * `headers` and `headersHelper` can be set on the marketplace's `url` source and on an entry; the
 * entry's value replaces the source's of the same name, and within one place the command's output
 * replaces a header of the same name in `headers`. Redirects to another origin carry none of them:
 * `fetchArchive` drops them on that hop. The prompt that asks a user to accept an entry's command,
 * and the command's own execution, are the host's (`CommandRunner`); here the policy and the merge.
 */

export interface DownloadHeaderPorts extends HeadersHelperPorts {
  /** One per host session, so a `url` source's command output is reused for 60 seconds. */
  readonly cache: HelperCache;
}

/** The `url` source of a marketplace, declared in a settings file. */
export interface UrlSourceHeaders {
  readonly url: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly headersHelper?: string;
  /** Unset on the first fetch after a user adds a marketplace by URL: that fetch supplies the name. */
  readonly name?: string | undefined;
}

export function urlSourceLayer(source: UrlSourceHeaders, origin: HeaderOrigin): HeaderLayer {
  return {
    place: 'url-source',
    origin,
    ...(source.headers === undefined ? {} : { headers: source.headers }),
    ...(source.headersHelper === undefined ? {} : { headersHelper: source.headersHelper }),
    variables: {
      CLAUDE_CODE_MARKETPLACE_URL: source.url,
      ...(source.name === undefined ? {} : { CLAUDE_CODE_MARKETPLACE_NAME: source.name }),
    },
    marketplaceUrl: source.url,
  };
}

/** A plugin entry's fields (`MarketplaceEntry`, or an inline entry in settings). */
export interface EntryHeaders {
  readonly name: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly headersHelper?: string;
}

export interface EntryDeclaration {
  readonly origin: HeaderOrigin;
  readonly operation: PluginOperation;
  /** The user accepted the command and archive URL they were shown. */
  readonly accepted: boolean;
}

export function entryLayer(
  entry: EntryHeaders,
  archiveUrl: string,
  declared: EntryDeclaration,
): HeaderLayer {
  return {
    place: 'entry',
    origin: declared.origin,
    ...(entry.headers === undefined ? {} : { headers: entry.headers }),
    ...(entry.headersHelper === undefined ? {} : { headersHelper: entry.headersHelper }),
    variables: {
      CLAUDE_CODE_PLUGIN_NAME: entry.name,
      CLAUDE_CODE_PLUGIN_ARCHIVE_URL: archiveUrl,
    },
    operation: declared.operation,
    accepted: declared.accepted,
  };
}

const keepFiltered = (layer: HeaderLayer, headers: HeaderMap): HeaderMap =>
  filtersRouting(layer) ? withoutRoutingHeaders(headers) : headers;

/** What a refused command does: skip it and send the fixed headers, or refuse the download. */
const REFUSAL_RESULT: {
  readonly [E in HelperEffect]: (
    fixed: HeaderMap,
    verdict: Extract<HelperVerdict, { allowed: false }>,
  ) => ResolvedHeaders | PluginIssue;
} = {
  'skip-helper': (fixed) => ({ headers: fixed }),
  'refuse-download': (_, verdict) => error('headersHelper', verdict.message),
};

/**
 * The headers one place sends: its `headers`, with the command's output over them when the
 * command may run. Used for a `url` source's `marketplace.json` fetch and, through
 * `archiveDownloadHeaders`, for an archive. A command that fails, or a refused one that stops
 * the download, is a `PluginIssue`.
 */
export async function resolveHeaders(
  layer: HeaderLayer,
  setting: HeadersSetting,
  ports: DownloadHeaderPorts,
  signal: AbortSignal,
): Promise<ResolvedHeaders | PluginIssue> {
  const fixed = keepFiltered(layer, normalizeHeaders(layer.headers ?? {}));
  if (layer.headersHelper === undefined) return { headers: fixed };
  const verdict = helperAllowed(layer, setting);
  if (!verdict.allowed) return REFUSAL_RESULT[verdict.effect](fixed, verdict);
  const printed = await ports.cache.remember(layer, () =>
    runHeadersHelper(layer, ports, setting, signal),
  );
  if ('severity' in printed) return printed;
  return { headers: mergeHeaders(fixed, keepFiltered(layer, printed.headers)) };
}

export interface DownloadHeaderRequest {
  readonly archiveUrl: string;
  /** The marketplace's `url` source, when it was added by URL. */
  readonly marketplace?: HeaderLayer;
  readonly entry?: HeaderLayer;
}

const originOf = (url: string): string | undefined => {
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
};

/** "Archive downloads on the marketplace URL's origin, meaning the same scheme, host, and port." */
function sourceApplies(marketplace: HeaderLayer | undefined, archiveUrl: string): boolean {
  if (marketplace?.marketplaceUrl === undefined) return false;
  const origin = originOf(marketplace.marketplaceUrl);
  return origin !== undefined && origin === originOf(archiveUrl);
}

/**
 * The headers of an archive download: the `url` source's when the archive is on its origin, then
 * the entry's over them. The result fills `ArchiveFetchPlan.headers` (`planPluginFetch` leaves it
 * empty because it knows no settings).
 */
export async function archiveDownloadHeaders(
  request: DownloadHeaderRequest,
  setting: HeadersSetting,
  ports: DownloadHeaderPorts,
  signal: AbortSignal,
): Promise<ResolvedHeaders | PluginIssue> {
  const { marketplace, entry } = request;
  const none: ResolvedHeaders = { headers: {} };
  const fromSource =
    marketplace !== undefined && sourceApplies(marketplace, request.archiveUrl)
      ? await resolveHeaders(marketplace, setting, ports, signal)
      : none;
  if ('severity' in fromSource) return fromSource;
  const fromEntry =
    entry === undefined ? none : await resolveHeaders(entry, setting, ports, signal);
  if ('severity' in fromEntry) return fromEntry;
  return { headers: mergeHeaders(fromSource.headers, fromEntry.headers) };
}
