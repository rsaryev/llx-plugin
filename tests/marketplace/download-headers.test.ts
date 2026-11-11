/**
 * host-marketplace.md § Authenticate archive downloads (the two places, the table, "Where both
 * places set a header of the same name", "Within one place"); § Stay within the download limits
 * ("A request that a redirect sends to a different origin carries none of the headers");
 * § When Claude Code skips a headersHelper command or drops its output; marketplace-reference.md
 * § Fields by type, § Plugin entries; settings-reference.md § extraKnownMarketplaces (header
 * filter by file).
 */
import { expect, test } from 'bun:test';
import { archiveDownloadHeaders, resolveHeaders } from '../../src/marketplace/download-headers.ts';
import {
  ARCHIVE_URL,
  headersOf,
  issueOf,
  portsWith,
  prints,
  setting,
  signal,
  sourceLayer,
} from '../support/marketplace-headers.ts';
import { spec } from '../support/spec.ts';

const helper = '/opt/bin/mint.sh';

const download = (
  parts: { marketplace?: ReturnType<typeof sourceLayer> },
  replies: Parameters<typeof portsWith>[0] = [],
  rest = setting(),
) => {
  const fakes = portsWith(replies);
  const result = archiveDownloadHeaders({ archiveUrl: ARCHIVE_URL, ...parts }, rest, fakes.ports, {
    signal,
  });
  return { ...fakes, result };
};

spec('marketplace.sourceField.headers', () => {
  test('headers of a url source ride the marketplace.json fetch', async () => {
    const layer = sourceLayer({ headers: { Authorization: 'Bearer t', 'X-Team': 'infra' } });
    const fakes = portsWith([]);
    const result = await resolveHeaders(layer, setting(), fakes.ports, { signal });
    expect(headersOf(result)).toEqual({ authorization: 'Bearer t', 'x-team': 'infra' });
  });

  test('and an archive download on the marketplace URL origin: same scheme, host and port', async () => {
    const marketplace = sourceLayer({ headers: { Authorization: 'Bearer t' } });
    const { result } = download({ marketplace });
    expect(headersOf(await result)).toEqual({ authorization: 'Bearer t' });
  });

  test('not a download from another host, port or scheme', async () => {
    const marketplace = sourceLayer({ headers: { Authorization: 'Bearer t' } });
    for (const archiveUrl of [
      'https://cdn.example.com/p.zip',
      'https://plugins.example.com:8443/p.zip',
      'http://plugins.example.com/p.zip',
    ]) {
      const fakes = portsWith([]);
      const result = await archiveDownloadHeaders(
        { archiveUrl, marketplace },
        setting(),
        fakes.ports,
        { signal },
      );
      expect(headersOf(result)).toEqual({});
    }
  });

  test('an explicit default port is the same origin', async () => {
    const marketplace = sourceLayer({ headers: { Authorization: 'Bearer t' } });
    const fakes = portsWith([]);
    const result = await archiveDownloadHeaders(
      { archiveUrl: 'https://plugins.example.com:443/p.zip', marketplace },
      setting(),
      fakes.ports,
      { signal },
    );
    expect(headersOf(result)).toEqual({ authorization: 'Bearer t' });
  });

  test('headers on an http:// marketplace URL are still sent: only the command is skipped', async () => {
    const layer = sourceLayer({
      url: 'http://plugins.example.com/marketplace.json',
      headers: { 'X-Team': 'infra' },
      headersHelper: helper,
    });
    const fakes = portsWith([]);
    const result = await resolveHeaders(layer, setting(), fakes.ports, { signal });
    expect(headersOf(result)).toEqual({ 'x-team': 'infra' });
    expect(fakes.runner.calls).toEqual([]);
  });

  test('a source header is not filtered: Host and Cookie on the url source are sent', async () => {
    const layer = sourceLayer({ headers: { Cookie: 'a=b' } }, 'project');
    const fakes = portsWith([]);
    expect(headersOf(await resolveHeaders(layer, setting(), fakes.ports, { signal }))).toEqual({
      cookie: 'a=b',
    });
  });
});

spec('marketplace.sourceField.headersHelper', () => {
  test('the command output is the url source headers: before the marketplace.json fetch and before an archive on that origin', async () => {
    const marketplace = sourceLayer({ headersHelper: helper });
    const onOrigin = download({ marketplace }, [prints({ Authorization: 'Bearer minted' })]);
    expect(headersOf(await onOrigin.result)).toEqual({ authorization: 'Bearer minted' });
    const fakes = portsWith([prints({ Authorization: 'Bearer fetch' })]);
    const fetched = await resolveHeaders(marketplace, setting(), fakes.ports, { signal });
    expect(headersOf(fetched)).toEqual({ authorization: 'Bearer fetch' });
  });

  test('a download on another origin does not run it and gets none of its headers', async () => {
    const fakes = portsWith([]);
    const result = await archiveDownloadHeaders(
      {
        archiveUrl: 'https://cdn.example.com/p.zip',
        marketplace: sourceLayer({ headersHelper: helper }),
      },
      setting(),
      fakes.ports,
      { signal },
    );
    expect(headersOf(result)).toEqual({});
    expect(fakes.runner.calls).toEqual([]);
  });

  test('within one place the command output overrides a header of the same name in headers', async () => {
    const marketplace = sourceLayer({
      headers: { Authorization: 'Bearer old', 'X-Team': 'infra' },
      headersHelper: helper,
    });
    const { result } = download({ marketplace }, [prints({ authorization: 'Bearer new' })]);
    expect(headersOf(await result)).toEqual({ authorization: 'Bearer new', 'x-team': 'infra' });
  });

  test('a command in --add-dir settings is ignored on a url source: only that file headers are sent', async () => {
    const layer = sourceLayer(
      { headers: { Authorization: 'Bearer fixed' }, headersHelper: helper },
      'add-dir',
    );
    const fakes = portsWith([]);
    const result = await resolveHeaders(layer, setting({ folderTrusted: true }), fakes.ports, {
      signal,
    });
    expect(headersOf(result)).toEqual({ authorization: 'Bearer fixed' });
    expect(fakes.runner.calls).toEqual([]);
  });

  test('a command in project settings of an untrusted folder does not run: its headers are sent', async () => {
    const layer = sourceLayer({ headers: { 'X-Team': 'infra' }, headersHelper: helper }, 'project');
    const fakes = portsWith([]);
    const result = await resolveHeaders(layer, setting(), fakes.ports, { signal });
    expect(headersOf(result)).toEqual({ 'x-team': 'infra' });
    expect(fakes.runner.calls).toEqual([]);
  });

  test('a managed-settings block skips the command and sends the headers, unless managed settings declare the marketplace', async () => {
    const layer = sourceLayer({ headers: { 'X-Team': 'infra' }, headersHelper: helper });
    const blocked = portsWith([]);
    const skipped = await resolveHeaders(
      layer,
      setting({ allowManagedHooksOnly: true }),
      blocked.ports,
      { signal },
    );
    expect(headersOf(skipped)).toEqual({ 'x-team': 'infra' });
    expect(blocked.runner.calls).toEqual([]);
    const declared = portsWith([prints({ Authorization: 'Bearer minted' })]);
    const ran = await resolveHeaders(
      layer,
      setting({ allowManagedHooksOnly: true, managedMarketplace: true }),
      declared.ports,
      { signal },
    );
    expect(headersOf(ran)).toEqual({ authorization: 'Bearer minted', 'x-team': 'infra' });
  });

  test('a failing command means the fetch does not happen', async () => {
    const { result } = download({ marketplace: sourceLayer({ headersHelper: helper }) }, [
      { exitCode: 1 },
    ]);
    expect(issueOf(await result).severity).toBe('error');
  });

  test('two downloads within 60 seconds run the command once', async () => {
    const marketplace = sourceLayer({ headersHelper: helper });
    const fakes = portsWith([prints({ A: 'b' })]);
    await resolveHeaders(marketplace, setting(), fakes.ports, { signal });
    fakes.clock.advance(30_000);
    await archiveDownloadHeaders({ archiveUrl: ARCHIVE_URL, marketplace }, setting(), fakes.ports, {
      signal,
    });
    expect(fakes.runner.calls).toHaveLength(1);
  });
});
