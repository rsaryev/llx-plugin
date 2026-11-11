/**
 * host-marketplace.md § Authenticate archive downloads (the two places, the table, "Where both
 * places set a header of the same name", "Within one place"); § Stay within the download limits
 * ("A request that a redirect sends to a different origin carries none of the headers");
 * § When Claude Code skips a headersHelper command or drops its output; marketplace-reference.md
 * § Fields by type, § Plugin entries; settings-reference.md § extraKnownMarketplaces (header
 * filter by file).
 */
import { describe, expect, test } from 'bun:test';
import { fetchArchive } from '../../src/marketplace/archive-source.ts';
import { archiveDownloadHeaders } from '../../src/marketplace/download-headers.ts';
import { mergeHeaders, normalizeHeaders } from '../../src/marketplace/header-map.ts';
import { ARCHIVE_LIMITS } from '../../src/marketplace/fetch-plan.ts';
import { fakeArchive, fakeSha256 } from '../support/marketplace-ports.ts';
import {
  ARCHIVE_URL,
  headersOf,
  issueOf,
  layerOfEntry,
  portsWith,
  prints,
  setting,
  signal,
  sourceLayer,
} from '../support/marketplace-headers.ts';
import { stats } from '../support/marketplace-archive.ts';
import { recordingHttp } from '../support/ports.ts';
import { spec } from '../support/spec.ts';

const helper = '/opt/bin/mint.sh';

const download = (
  parts: { marketplace?: ReturnType<typeof sourceLayer>; entry?: ReturnType<typeof layerOfEntry> },
  replies: Parameters<typeof portsWith>[0] = [],
  rest = setting(),
) => {
  const fakes = portsWith(replies);
  const result = archiveDownloadHeaders({ archiveUrl: ARCHIVE_URL, ...parts }, rest, fakes.ports, {
    signal,
  });
  return { ...fakes, result };
};

spec(
  [
    'marketplace.entry.headers',
    'marketplace.hosting.Authenticate archive downloads',
    'marketplace.hosting.When Claude Code skips a headersHelper command or drops its output',
    'marketplace.hosting.When Claude Code skips a headersHelper command or drops its output.Entry sets a routing or identity header',
    "marketplace.hosting.Work around what a marketplace can't do",
    "marketplace.hosting.Work around what a marketplace can't do.Carry git credentials",
  ],
  () => {
    test('an entry sends its headers with its own archive download', async () => {
      const entry = layerOfEntry({ headers: { Authorization: 'Bearer entry' } });
      expect(headersOf(await download({ entry }).result)).toEqual({
        authorization: 'Bearer entry',
      });
    });

    test('a header set on the entry replaces a header of the same name from the marketplace source, whatever the casing', async () => {
      const marketplace = sourceLayer({
        headers: { Authorization: 'Bearer source', 'X-Team': 'infra' },
      });
      const entry = layerOfEntry({ headers: { authorization: 'Bearer entry' } });
      const result = await download({ marketplace, entry }).result;
      expect(headersOf(result)).toEqual({ authorization: 'Bearer entry', 'x-team': 'infra' });
    });

    test('Host, Cookie and X-Forwarded-* are dropped from a catalog entry; Authorization is kept', async () => {
      const entry = layerOfEntry({
        headers: {
          Host: 'evil',
          cookie: 'a=b',
          'X-Forwarded-For': '1.2.3.4',
          Authorization: 'Bearer t',
          'X-Team': 'infra',
        },
      });
      expect(headersOf(await download({ entry }).result)).toEqual({
        authorization: 'Bearer t',
        'x-team': 'infra',
      });
    });

    test('the filter is the same for an entry in project or --add-dir settings, and absent in user, --settings and managed settings', async () => {
      const headers = { Cookie: 'a=b', Authorization: 'Bearer t' };
      for (const origin of ['project', 'add-dir'] as const) {
        const entry = layerOfEntry({ headers }, { origin });
        expect(headersOf(await download({ entry }).result)).toEqual({ authorization: 'Bearer t' });
      }
      for (const origin of ['user', 'cli-settings', 'managed', 'server-managed'] as const) {
        const entry = layerOfEntry({ headers }, { origin });
        expect(headersOf(await download({ entry }).result)).toEqual({
          cookie: 'a=b',
          authorization: 'Bearer t',
        });
      }
    });
  },
);

spec('marketplace.entry.headersHelper', () => {
  test('an entry command runs for that entry only and its output joins the entry headers; the output wins within the entry', async () => {
    const entry = layerOfEntry({
      headers: { Authorization: 'Bearer old', 'X-Team': 'infra' },
      headersHelper: helper,
    });
    const { result, runner } = download({ entry }, [prints({ Authorization: 'Bearer minted' })]);
    expect(headersOf(await result)).toEqual({ authorization: 'Bearer minted', 'x-team': 'infra' });
    expect(runner.calls).toHaveLength(1);
  });

  test('the entry output beats the marketplace source headers and its command output', async () => {
    const marketplace = sourceLayer({
      headers: { Authorization: 'Bearer s' },
      headersHelper: helper,
    });
    const entry = layerOfEntry({ headersHelper: helper });
    const { result } = download({ marketplace, entry }, [
      prints({ Authorization: 'Bearer source-minted', 'X-Source': '1' }),
      prints({ Authorization: 'Bearer entry-minted' }),
    ]);
    expect(headersOf(await result)).toEqual({
      authorization: 'Bearer entry-minted',
      'x-source': '1',
    });
  });

  test('routing headers in the command output of a catalog entry are dropped like those in headers', async () => {
    const entry = layerOfEntry({ headersHelper: helper });
    const { result } = download({ entry }, [
      prints({ Host: 'evil', 'x-forwarded-host': 'h', Authorization: 'Bearer t' }),
    ]);
    expect(headersOf(await result)).toEqual({ authorization: 'Bearer t' });
  });

  test('a command that is not accepted, or meets an operation that refuses it, stops the download and never runs, with its reason', async () => {
    const refusals = [
      { declared: { accepted: undefined }, reason: 'has not accepted it' },
      {
        declared: { accepted: { command: '/opt/bin/other.sh', archiveUrl: ARCHIVE_URL } },
        reason: 'has not accepted it',
      },
      { declared: { operation: 'bulk-install' as const }, reason: 'from its own view in /plugin' },
      { declared: { operation: 'suggestion' as const }, reason: 'from its own view in /plugin' },
      { declared: { operation: 'dependency' as const }, reason: 'from its own view in /plugin' },
      { declared: { operation: 'background-update' as const }, reason: 'Errors tab' },
      { declared: { operation: 'session-start' as const }, reason: 'Errors tab' },
    ];
    for (const { declared, reason } of refusals) {
      const entry = layerOfEntry({ headers: { A: 'b' }, headersHelper: helper }, declared);
      const { result, runner } = download({ entry });
      const issue = issueOf(await result);
      expect(issue.severity).toBe('error');
      expect(issue.message).toContain(reason);
      expect(runner.calls).toEqual([]);
    }
  });

  test('an entry without a command downloads in a bulk install: only a command needs a single-plugin install', async () => {
    const entry = layerOfEntry({ headers: { A: 'b' } }, { operation: 'bulk-install' });
    expect(headersOf(await download({ entry }).result)).toEqual({ a: 'b' });
  });

  test('a command that fails refuses the download', async () => {
    const entry = layerOfEntry({ headersHelper: helper });
    expect(issueOf(await download({ entry }, [{ stdout: 'oops' }]).result).severity).toBe('error');
  });

  test('a command in --add-dir settings is ignored and only that file headers are sent', async () => {
    const entry = layerOfEntry(
      { headers: { Authorization: 'Bearer fixed' }, headersHelper: helper },
      { origin: 'add-dir' },
    );
    const { result, runner } = download({ entry });
    expect(headersOf(await result)).toEqual({ authorization: 'Bearer fixed' });
    expect(runner.calls).toEqual([]);
  });

  test('a blocked command is not run and the fixed headers still go (judgment: the docs name the skip, not the rest)', async () => {
    const entry = layerOfEntry({ headers: { A: 'b' }, headersHelper: helper });
    const { result, runner } = download(
      { entry },
      [],
      setting({ disableCommandPluginSources: true }),
    );
    expect(headersOf(await result)).toEqual({ a: 'b' });
    expect(runner.calls).toEqual([]);
  });
});

describe('after a redirect to another origin the request carries none of the merged headers', () => {
  spec(
    [
      'marketplace.sourceField.headers',
      'marketplace.entry.headers',
      'marketplace.hosting.When Claude Code skips a headersHelper command or drops its output.Redirect leaves the origin',
    ],
    () => {
      test('merged headers go on the first request only; the redirected request has none', async () => {
        const marketplace = sourceLayer({ headers: { Authorization: 'Bearer s' } });
        const entry = layerOfEntry({ headers: { 'X-Team': 'infra' } });
        const headers = headersOf(await download({ marketplace, entry }).result);
        const http = recordingHttp(
          { status: 302, headers: { location: 'https://cdn.example.net/p.zip' } },
          { status: 200, bytes: new Uint8Array([80, 75, 3, 4]) },
        );
        const fetched = await fetchArchive(
          {
            kind: 'archive',
            url: ARCHIVE_URL,
            limits: ARCHIVE_LIMITS,
            headers,
            rootDepth: 'top-or-one-down',
          },
          { http, sha256: fakeSha256('0'), archive: fakeArchive(stats()) },
          { signal },
        );
        expect('bytes' in fetched).toBe(true);
        expect(http.requests.map((request) => request.headers)).toEqual([
          { authorization: 'Bearer s', 'x-team': 'infra' },
          {},
        ]);
      });
    },
  );
});

describe('merging and normalising header maps (judgment: names are lower case, as on the HttpClient port)', () => {
  test('mergeHeaders lets the later map replace by name without regard to case', () => {
    expect(mergeHeaders({ 'a-b': '1', c: '2' }, { 'A-B': '3' })).toEqual({ 'a-b': '3', c: '2' });
  });

  test('normalizeHeaders lowercases names; of two spellings the later wins', () => {
    expect(normalizeHeaders({ 'X-A': '1', 'x-a': '2', B: '3' })).toEqual({ 'x-a': '2', b: '3' });
  });
});
