/**
 * marketplace-reference.md § archive plugin source; host-marketplace.md § Stay within the
 * download limits for hosted files; § Authenticate archive downloads (the redirect rule for
 * headers is stated in the limits section).
 */
import { expect, test } from 'bun:test';
import type { ArchiveFailure } from '../../src/ports/marketplace.ts';
import {
  DIGEST,
  oneFile,
  ratioOf,
  totalOf,
  fetchWith,
  MIB,
  moved,
  ok,
  refusal,
  stats,
  URL_0,
  zipFor,
  zipOf,
  ZIP,
} from '../support/marketplace-archive.ts';
import { spec } from '../support/spec.ts';

spec('marketplace.source.archive', () => {
  test('downloads the zip over GET with the limits of the plan: 256 MiB, 120 seconds, manual redirects', async () => {
    const run = fetchWith([ok]);
    expect(await run.result).toMatchObject({ bytes: ZIP, root: '' });
    expect(run.http.requests).toHaveLength(1);
    expect(run.http.requests[0]).toMatchObject({
      method: 'GET',
      url: URL_0,
      as: 'bytes',
      maxBytes: 256 * MIB,
      timeoutMs: 120_000,
      redirect: 'manual',
    });
  });

  test('sends the merged headers of the plan', async () => {
    const run = fetchWith([ok], { plan: { headers: { authorization: 'Bearer t' } } });
    await run.result;
    expect(run.http.requests[0]?.headers).toEqual({ authorization: 'Bearer t' });
  });

  test('refuses an archive larger than 256 MiB', async () => {
    const issue = await refusal(fetchWith([{ ...ok, truncated: true }]));
    expect(issue.message).toContain('256 MiB');
  });

  test('refuses a url that is not https, or a blocked host, without any request', async () => {
    for (const url of [
      'http://a.example/f.zip',
      'https://169.254.169.254/f.zip',
      'https://localhost/f.zip',
    ]) {
      const run = fetchWith([], { plan: { url } });
      expect((await refusal(run)).severity).toBe('error');
      expect(run.http.requests).toEqual([]);
    }
  });

  test('follows up to five redirects, each target https', async () => {
    const hops = Array.from({ length: 5 }, (_, index) =>
      moved(`https://cdn${index}.example.com/f.zip`),
    );
    const run = fetchWith([...hops, ok]);
    expect(await run.result).toMatchObject({ bytes: ZIP });
    expect(run.http.requests.map((request) => request.url)).toEqual([
      URL_0,
      'https://cdn0.example.com/f.zip',
      'https://cdn1.example.com/f.zip',
      'https://cdn2.example.com/f.zip',
      'https://cdn3.example.com/f.zip',
      'https://cdn4.example.com/f.zip',
    ]);
  });

  test('a sixth redirect fails the download', async () => {
    const hops = Array.from({ length: 6 }, (_, index) =>
      moved(`https://cdn${index}.example.com/f.zip`),
    );
    const run = fetchWith([...hops, ok]);
    const issue = await refusal(run);
    expect(issue.message).toContain('5');
    expect(run.http.requests).toHaveLength(6);
  });

  test('every redirect target must use https', async () => {
    const run = fetchWith([moved('http://cdn.example.com/f.zip'), ok]);
    expect((await refusal(run)).message).toContain('https');
    expect(run.http.requests).toHaveLength(1);
  });

  test('a redirect target cannot be a loopback, link-local or cloud-metadata host', async () => {
    for (const target of [
      'https://127.0.0.1/f.zip',
      'https://localhost/f.zip',
      'https://169.254.169.254/latest/meta-data',
      'https://[::1]/f.zip',
      'https://metadata.google.internal/x',
    ]) {
      const run = fetchWith([moved(target), ok]);
      expect((await refusal(run)).message).toContain('loopback, link-local or cloud-metadata');
      expect(run.http.requests).toHaveLength(1);
    }
  });

  test('a relative redirect location resolves against the current URL', async () => {
    const run = fetchWith([moved('/other/f.zip', 301), ok]);
    await run.result;
    expect(run.http.requests[1]?.url).toBe('https://artifacts.example.com/other/f.zip');
  });

  test('a request sent to a different origin carries none of the configured headers', async () => {
    const run = fetchWith([moved('https://cdn.example.net/f.zip'), ok], {
      plan: { headers: { authorization: 'Bearer t', 'x-team': 'a' } },
    });
    await run.result;
    expect(run.http.requests[0]?.headers).toEqual({ authorization: 'Bearer t', 'x-team': 'a' });
    expect(run.http.requests[1]?.headers).toEqual({});
  });

  test('a redirect within the same origin keeps the headers', async () => {
    const run = fetchWith([moved('/elsewhere.zip'), ok], {
      plan: { headers: { authorization: 'Bearer t' } },
    });
    await run.result;
    expect(run.http.requests[1]?.headers).toEqual({ authorization: 'Bearer t' });
  });

  test('with a sha256 set, a download that does not match is refused before it is read', async () => {
    const run = fetchWith([ok], { plan: { sha256: DIGEST }, digest: 'f'.repeat(64) });
    const issue = await refusal(run);
    expect(issue.message).toContain('sha256');
    expect(issue.message).toContain(DIGEST);
    expect(run.archive.calls).toBe(0);
  });

  test('a matching sha256 passes, whatever the case of either digest', async () => {
    for (const [pinned, actual] of [
      [DIGEST, DIGEST],
      [DIGEST, DIGEST.toUpperCase()],
      [DIGEST.toUpperCase(), DIGEST],
    ] as const) {
      const run = fetchWith([ok], { plan: { sha256: pinned }, digest: actual });
      expect(await run.result).toMatchObject({ bytes: ZIP });
      expect(run.sha256.hashed).toEqual([ZIP]);
    }
  });

  test('without a sha256 nothing is hashed', async () => {
    const run = fetchWith([ok]);
    await run.result;
    expect(run.sha256.hashed).toEqual([]);
  });

  test('the install fails past 100,000 files and directories', async () => {
    expect(await fetchWith([ok], { stats: stats({ entries: 100_000 }) }).result).toMatchObject({
      root: '',
    });
    const issue = await refusal(fetchWith([ok], { stats: stats({ entries: 100_001 }) }));
    expect(issue.message).toContain('100000');
  });

  test('the install fails past 512 MiB for any one file, uncompressed', async () => {
    expect(
      await fetchWith([zipFor(oneFile(512 * MIB))], { stats: oneFile(512 * MIB) }).result,
    ).toMatchObject({ root: '' });
    expect(
      (
        await refusal(
          fetchWith([zipFor(oneFile(512 * MIB + 1))], { stats: oneFile(512 * MIB + 1) }),
        )
      ).message,
    ).toContain('512 MiB');
  });

  test('the install fails past 1 GiB uncompressed in total', async () => {
    expect(
      await fetchWith([zipFor(totalOf(1024 * MIB))], { stats: totalOf(1024 * MIB) }).result,
    ).toMatchObject({
      root: '',
    });
    expect(
      (
        await refusal(
          fetchWith([zipFor(totalOf(1024 * MIB + 1))], { stats: totalOf(1024 * MIB + 1) }),
        )
      ).message,
    ).toContain('1024 MiB');
  });

  test('the install fails when the content is more than 50 times the size of the zip', async () => {
    const reply = zipOf(1000);
    expect(await fetchWith([reply], { stats: ratioOf(50_000) }).result).toMatchObject({ root: '' });
    expect((await refusal(fetchWith([reply], { stats: ratioOf(50_001) }))).message).toContain(
      '50 times',
    );
  });

  test('the ratio is against the zip the kit downloaded, not the size the host reports', async () => {
    const liar = stats({
      uncompressedBytes: 50_001,
      largestFileBytes: 1,
      compressedBytes: 10 ** 9,
    });
    expect((await refusal(fetchWith([zipOf(1000)], { stats: liar }))).message).toContain(
      '50 times',
    );
  });

  test('a zip the host cannot read is refused', async () => {
    const failure: ArchiveFailure = { failure: 'corrupt', message: 'bad central directory' };
    const issue = await refusal(fetchWith([ok], { stats: failure }));
    expect(issue.message).toContain('bad central directory');
  });

  test('the plugin root may be at the top of the zip', async () => {
    for (const topLevel of [
      ['.claude-plugin', 'README.md'],
      ['skills/', 'LICENSE'],
      ['hooks', 'x'],
      ['commands'],
    ]) {
      expect(await fetchWith([ok], { stats: stats({ topLevel }) }).result).toMatchObject({
        root: '',
      });
    }
  });

  test('the plugin root may be one directory down: the single wrapping directory', async () => {
    for (const topLevel of [['formatter-2.0.0'], ['formatter-2.0.0/']]) {
      expect(await fetchWith([ok], { stats: stats({ topLevel }) }).result).toMatchObject({
        root: 'formatter-2.0.0',
      });
    }
  });

  test('a zip with several top-level entries and no plugin content has no plugin root', async () => {
    const issue = await refusal(fetchWith([ok], { stats: stats({ topLevel: ['a', 'b'] }) }));
    expect(issue.message).toContain('plugin root');
    expect((await refusal(fetchWith([ok], { stats: stats({ topLevel: [] }) }))).message).toContain(
      'plugin root',
    );
  });
});
