import { error, type PluginIssue } from '../../../format/issues.ts';

/** errors.md, "WebFetch cannot fetch localhost": the message of a refused URL, verbatim. */
export const LOCAL_HOST_MESSAGE =
  'WebFetch cannot fetch localhost or other hostnames without a dot. To reach a local server, use Bash with curl instead.';

/** "WebFetch reads up to 100,000 characters of a page's content per call." */
export const FETCH_WINDOW_CHARACTERS = 100_000;

export interface CheckedUrl {
  /** The URL to fetch: `https` for an `http` one; `undefined` when it is refused. */
  readonly url: string | undefined;
  /** An `http` URL was changed to `https`. */
  readonly upgraded: boolean;
  readonly issues: readonly PluginIssue[];
}

const URL_FIELD = 'tool_input.url';

const refused = (message: string): CheckedUrl => ({
  url: undefined,
  upgraded: false,
  issues: [error(URL_FIELD, message)],
});

function parse(text: string): URL | undefined {
  try {
    return new URL(text);
  } catch {
    return undefined;
  }
}

/** A root-label dot does not make a name dotted: `localhost.` is `localhost` (spec/judgments.md). */
const hasDot = (hostname: string): boolean => hostname.replace(/\.$/, '').includes('.');

/**
 * What WebFetch does with a URL before it makes a request (tools-reference.md, "WebFetch tool
 * behavior"): it refuses `localhost` and any other hostname without a dot, with the message of
 * errors.md, and upgrades an `http` URL to `https`. Text that does not parse, or a scheme other
 * than http and https, is an "Invalid URL" issue (spec/judgments.md: errors.md names that message
 * for the refusals before v2.1.268, the docs say no more).
 */
export function checkWebFetchUrl(text: string): CheckedUrl {
  const url = parse(text);
  if (url === undefined || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
    return refused('Invalid URL');
  }
  if (!hasDot(url.hostname)) return refused(LOCAL_HOST_MESSAGE);
  const upgraded = url.protocol === 'http:';
  if (upgraded) url.protocol = 'https:';
  return { url: url.href, upgraded, issues: [] };
}

export interface FetchedPart {
  /** Up to 100,000 characters of the page, from the offset. */
  readonly text: string;
  /** Characters of the page after this part. */
  readonly unread: number;
  /** The `offset` that reads the next part; `undefined` when nothing is unread. */
  readonly nextOffset: number | undefined;
  /** The note that tells Claude how much went unread; `undefined` when nothing did. */
  readonly notice: string | undefined;
}

/**
 * The part of a page WebFetch reads (tools-reference.md, "WebFetch tool behavior"; hooks.md,
 * `offset`: "number of characters to skip from the start of the page"): up to 100,000 characters
 * from `offset`, and how much went unread. Characters are code points, so a part never splits one;
 * an offset past the end reads nothing; an offset that is not a whole number counts as absent; the
 * wording of the notice is a judgment (spec/judgments.md).
 */
export function sliceFetched(page: string, offset: number | undefined): FetchedPart {
  const characters = Array.from(page);
  const start = offset !== undefined && Number.isInteger(offset) && offset >= 0 ? offset : 0;
  const end = Math.min(start + FETCH_WINDOW_CHARACTERS, characters.length);
  const text = characters.slice(start, end).join('');
  const unread = Math.max(characters.length - end, 0);
  if (unread === 0) return { text, unread, nextOffset: undefined, notice: undefined };
  return {
    text,
    unread,
    nextOffset: end,
    notice: `${unread} characters of the page were not read; fetch again with offset ${end} to continue.`,
  };
}
