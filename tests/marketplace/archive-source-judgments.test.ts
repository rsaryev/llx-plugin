/**
 * marketplace-reference.md § archive plugin source; host-marketplace.md § Stay within the
 * download limits for hosted files; § Authenticate archive downloads (the redirect rule for
 * headers is stated in the limits section).
 */
import { describe, expect, test } from 'bun:test';
import { fetchWith, moved, ok, refusal, stats, URL_0 } from '../support/marketplace-archive.ts';

describe('judgments: archive download', () => {
  test('a failed request is an issue naming what failed, not a throw', async () => {
    for (const failure of ['connection', 'timeout', 'aborted'] as const) {
      const issue = await refusal(fetchWith([{ failure, message: 'x' }]));
      expect(issue.path).toBe('source.url');
    }
  });

  test('a non-success status is refused', async () => {
    expect((await refusal(fetchWith([{ status: 404 }]))).message).toContain('404');
    expect((await refusal(fetchWith([{ status: 500 }]))).message).toContain('500');
  });

  test('a redirect with no location is refused', async () => {
    expect((await refusal(fetchWith([{ status: 302 }]))).message).toContain('location');
  });

  test('headers are not resent after a cross-origin hop, even back on the first origin', async () => {
    const run = fetchWith([moved('https://cdn.example.net/a'), moved(URL_0), ok], {
      plan: { headers: { authorization: 'Bearer t' } },
    });
    await run.result;
    expect(run.http.requests.map((request) => Object.keys(request.headers).length)).toEqual([
      1, 0, 0,
    ]);
  });

  test('a single top-level entry that is not a directory is still taken as the wrapping directory (the host verifies the content)', async () => {
    expect(
      await fetchWith([ok], { stats: stats({ topLevel: ['formatter.zip'] }) }).result,
    ).toMatchObject({
      root: 'formatter.zip',
    });
  });
});
