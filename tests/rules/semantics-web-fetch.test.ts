/**
 * tools-reference.md § WebFetch tool behavior ("WebFetch refuses `localhost` and any other hostname
 * without a dot ... before making a request", "HTTP URLs are automatically upgraded to HTTPS",
 * "WebFetch reads up to 100,000 characters of a page's content per call ... the result for a longer
 * page tells Claude how much went unread"), errors.md § WebFetch cannot fetch localhost (the
 * message, verbatim) and hooks.md § WebFetch (`url` "URL to fetch content from", `offset` "number
 * of characters to skip from the start of the page"; v2.1.290). The set of preapproved
 * documentation domains is not listed in the docs and is not modelled. The wording of the notice
 * and the handling of other schemes and of an offset past the end are judgments, tested outside
 * spec(). The cache of 15 minutes (`CLAUDE_CODE_WEBFETCH_CACHE_TTL_MS`), the deadline of five
 * minutes (`CLAUDE_CODE_WEBFETCH_DEADLINE_MS`, "`0` removes it": env-vars.md) and the redirect result
 * ("returns a text result that names the original URL and the redirect target instead of following
 * it") are in the same section.
 */
import { describe, expect, test } from 'bun:test';
import {
  checkWebFetchUrl,
  FETCH_WINDOW_CHARACTERS,
  LOCAL_HOST_MESSAGE,
  redirectNotice,
  sliceFetched,
  webFetchTimings,
} from '../../src/rules/index.ts';
import { fakeEnvironment } from '../support/ports.ts';
import { spec } from '../support/spec.ts';

const REFUSED =
  'WebFetch cannot fetch localhost or other hostnames without a dot. To reach a local server, use Bash with curl instead.';

spec('tools.input.WebFetch.url', () => {
  test('the hooks.md example is fetched as it is', () => {
    const checked = checkWebFetchUrl('https://example.com/api');
    expect(checked.issues).toEqual([]);
    expect(checked.url).toBe('https://example.com/api');
    expect(checked.upgraded).toBe(false);
  });

  test('"localhost" is refused with the message of errors.md, before any request', () => {
    for (const url of ['http://localhost:3000', 'https://localhost/', 'http://LOCALHOST:8080/x']) {
      const checked = checkWebFetchUrl(url);
      expect(checked.url).toBeUndefined();
      expect(checked.issues).toHaveLength(1);
      expect(checked.issues[0]?.severity).toBe('error');
      expect(checked.issues[0]?.message).toBe(REFUSED);
    }
    expect(LOCAL_HOST_MESSAGE).toBe(REFUSED);
  });

  test('"any other hostname without a dot, such as a bare intranet name" is refused', () => {
    for (const url of ['http://wiki/', 'https://intranet/page', 'http://devbox:8080/']) {
      expect(checkWebFetchUrl(url).issues[0]?.message).toBe(REFUSED);
    }
  });

  test('a hostname with a dot is fetched, whatever its top level or whether it is an address', () => {
    for (const url of [
      'https://docs.example.com/a?b=1#c',
      'https://example.co.uk',
      'https://192.168.1.10/',
      'https://localhost.localdomain/',
    ]) {
      expect(checkWebFetchUrl(url).issues).toEqual([]);
    }
  });

  test('"HTTP URLs are automatically upgraded to HTTPS": the rest of the URL is kept', () => {
    const checked = checkWebFetchUrl('http://example.com/docs?q=1#top');
    expect(checked.issues).toEqual([]);
    expect(checked.url).toBe('https://example.com/docs?q=1#top');
    expect(checked.upgraded).toBe(true);
    expect(checkWebFetchUrl('http://example.com:8080/x').url).toBe('https://example.com:8080/x');
    expect(checkWebFetchUrl('HTTP://Example.com/').url).toBe('https://example.com/');
  });

  test('an HTTPS URL is not reported upgraded', () => {
    expect(checkWebFetchUrl('https://example.com/').upgraded).toBe(false);
  });

  test('the check applies to the host as the URL parser reads it, not to text that only looks like one', () => {
    expect(checkWebFetchUrl('https://example.com@localhost/').issues[0]?.message).toBe(REFUSED);
    expect(checkWebFetchUrl('https://localhost@example.com/').issues).toEqual([]);
  });
});

const page = (length: number) => Array.from({ length }, (_, index) => String(index % 10)).join('');

spec('tools.input.WebFetch.offset', () => {
  test('a page of up to 100,000 characters is read whole, with nothing unread', () => {
    const read = sliceFetched(page(100_000), undefined);
    expect(FETCH_WINDOW_CHARACTERS).toBe(100_000);
    expect(read.text).toHaveLength(100_000);
    expect(read.unread).toBe(0);
    expect(read.nextOffset).toBeUndefined();
  });

  test('"reads up to 100,000 characters ... how much went unread" for a longer page', () => {
    const read = sliceFetched(page(250_000), undefined);
    expect(read.text).toHaveLength(100_000);
    expect(read.text).toBe(page(250_000).slice(0, 100_000));
    expect(read.unread).toBe(150_000);
  });

  test('the hooks.md example, offset 100000, skips that many characters and reads the next part', () => {
    const whole = page(250_000);
    const read = sliceFetched(whole, 100_000);
    expect(read.text).toBe(whole.slice(100_000, 200_000));
    expect(read.unread).toBe(50_000);
    expect(read.nextOffset).toBe(200_000);
  });

  test('"to keep reading a long page": following the offsets reads every character once', () => {
    const whole = page(230_000);
    let rebuilt = '';
    let offset: number | undefined;
    do {
      const read = sliceFetched(whole, offset);
      rebuilt += read.text;
      offset = read.nextOffset;
    } while (offset !== undefined);
    expect(rebuilt).toBe(whole);
  });

  test('the last part leaves nothing unread and names no next offset', () => {
    const read = sliceFetched(page(230_000), 200_000);
    expect(read.text).toHaveLength(30_000);
    expect(read.unread).toBe(0);
    expect(read.nextOffset).toBeUndefined();
  });
});

describe('judgments (spec/judgments.md): what the docs leave open in WebFetch', () => {
  test('characters are code points, so a window never splits an emoji', () => {
    const whole = '😀'.repeat(100_001);
    const read = sliceFetched(whole, undefined);
    expect(Array.from(read.text)).toHaveLength(100_000);
    expect(read.unread).toBe(1);
    expect(sliceFetched(whole, 100_000).text).toBe('😀');
  });

  test('an offset past the end reads nothing and leaves nothing unread; a bad offset reads from the start', () => {
    const past = sliceFetched('abc', 10);
    expect(past.text).toBe('');
    expect(past.unread).toBe(0);
    for (const offset of [-1, 1.5, Number.NaN]) {
      expect(sliceFetched('abc', offset).text).toBe('abc');
    }
  });

  test('a notice tells how many characters went unread and where to continue', () => {
    const read = sliceFetched('x'.repeat(100_010), undefined);
    expect(read.notice).toContain('10 characters');
    expect(read.notice).toContain('offset 100000');
    expect(sliceFetched('x', undefined).notice).toBeUndefined();
  });

  test('a trailing dot does not make "localhost." a dotted name', () => {
    expect(checkWebFetchUrl('http://localhost./').issues[0]?.message).toBe(REFUSED);
    expect(checkWebFetchUrl('https://example.com./').issues).toEqual([]);
  });

  test('a bracketed address has no dot and is refused', () => {
    expect(checkWebFetchUrl('http://[::1]:3000/').issues[0]?.message).toBe(REFUSED);
  });

  test('text that is not a URL, or a URL that is not http or https, is an "Invalid URL" issue', () => {
    for (const url of [
      'not a url',
      'example.com',
      'ftp://example.com/x',
      'file:///etc/passwd',
      '',
    ]) {
      const checked = checkWebFetchUrl(url);
      expect(checked.url).toBeUndefined();
      expect(checked.issues).toHaveLength(1);
      expect(checked.issues[0]?.message).toBe('Invalid URL');
      expect(checked.issues[0]?.path).toBe('tool_input.url');
    }
  });
});

const env = (record: Record<string, string> = {}) => fakeEnvironment(record);

spec('tools.tool.WebFetch', () => {
  test('a response is cached for 15 minutes and a download may take five', () => {
    expect(webFetchTimings(env())).toEqual({ cacheTtlMs: 900_000, deadlineMs: 300_000 });
  });

  test('CLAUDE_CODE_WEBFETCH_CACHE_TTL_MS takes plain digits; 0, a decimal or any other spelling keeps the default', () => {
    expect(webFetchTimings(env({ CLAUDE_CODE_WEBFETCH_CACHE_TTL_MS: '60000' })).cacheTtlMs).toBe(
      60_000,
    );
    for (const value of ['0', '1.5', '1e3', '15m', '-5', '']) {
      expect(webFetchTimings(env({ CLAUDE_CODE_WEBFETCH_CACHE_TTL_MS: value })).cacheTtlMs).toBe(
        900_000,
      );
    }
  });

  test('CLAUDE_CODE_WEBFETCH_DEADLINE_MS changes the limit, 0 removes it, a decimal or other spelling keeps the default', () => {
    expect(webFetchTimings(env({ CLAUDE_CODE_WEBFETCH_DEADLINE_MS: '10000' })).deadlineMs).toBe(
      10_000,
    );
    expect(
      webFetchTimings(env({ CLAUDE_CODE_WEBFETCH_DEADLINE_MS: '0' })).deadlineMs,
    ).toBeUndefined();
    for (const value of ['1.5', 'never', '-1']) {
      expect(webFetchTimings(env({ CLAUDE_CODE_WEBFETCH_DEADLINE_MS: value })).deadlineMs).toBe(
        300_000,
      );
    }
  });

  test('a redirect to a different host is a text result naming the original URL and the target, not followed', () => {
    const notice = redirectNotice('https://example.com/a', 'https://www.example.org/b');
    expect(notice).toContain('https://example.com/a');
    expect(notice).toContain('https://www.example.org/b');
    expect(notice).toContain('WebFetch');
  });

  test('a redirect within the host is followed: no notice', () => {
    expect(redirectNotice('https://example.com/a', 'https://example.com/b')).toBeUndefined();
  });
});

describe('judgments (spec/judgments.md): what the docs leave open in WebFetch timings', () => {
  test('hosts compare by hostname alone: case, port and scheme do not make a different host', () => {
    expect(redirectNotice('http://Example.com/a', 'https://example.COM:8443/b')).toBeUndefined();
  });

  test('a URL that does not parse has no redirect notice', () => {
    expect(redirectNotice('not a url', 'https://example.com')).toBeUndefined();
    expect(redirectNotice('https://example.com', '/relative')).toBeUndefined();
  });
});
