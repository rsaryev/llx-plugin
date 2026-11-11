/** plugins/mods/admin.md § Know which controls still apply, "Network policy covers `$.http.fetch`". */
import { expect, test } from 'bun:test';
import { modFetchVerdict, type ModFetchFacts } from '../../../src/mods/api/index.ts';
import { apiHarness, reply, scripted } from '../../support/mods-api.ts';
import { rejection } from '../../support/rejection.ts';
import { spec } from '../../support/spec.ts';

const open: ModFetchFacts = {
  orgPolicyDeniesWebFetch: false,
  webFetchToolOff: false,
  disableNonessentialTraffic: false,
  builtIn: false,
  carriesSessionCredentials: false,
};

spec('policy.mods.Know which controls still apply.Network policy covers $.http.fetch', () => {
  test("an organization policy that does not allow WebFetch refuses every mod's request", () => {
    for (const builtIn of [true, false]) {
      expect(modFetchVerdict({ ...open, orgPolicyDeniesWebFetch: true, builtIn })).toEqual({
        allowed: false,
        reason: 'organization-policy',
      });
    }
  });

  test('turning the WebFetch tool off by variable or deny rule leaves mods able to fetch', () => {
    expect(modFetchVerdict({ ...open, webFetchToolOff: true })).toEqual({ allowed: true });
  });

  test('nonessential-traffic stops built-in mods and requests with the session credentials only', () => {
    const on = { ...open, disableNonessentialTraffic: true };
    expect(modFetchVerdict({ ...on, builtIn: true }).allowed).toBe(false);
    expect(modFetchVerdict({ ...on, carriesSessionCredentials: true })).toEqual({
      allowed: false,
      reason: 'nonessential-traffic',
    });
    expect(modFetchVerdict(on)).toEqual({ allowed: true });
  });

  test('without the variable an installed mod with no session credentials fetches', () => {
    expect(modFetchVerdict(open)).toEqual({ allowed: true });
  });
});

const facts =
  (over: Partial<ModFetchFacts> = {}) =>
  () => ({ ...open, ...over });

spec('policy.mods.Know which controls still apply.Network policy covers $.http.fetch', () => {
  test('$.http.fetch is refused under an organization policy that does not allow WebFetch, and the port is not asked', async () => {
    const fetcher = scripted(reply(200, 'ok'));
    const h = await apiHarness({
      ports: { fetcher },
      options: { fetchPolicy: facts({ orgPolicyDeniesWebFetch: true }) },
    });
    expect(await rejection(h.api.http.fetch('https://example.com'))).toBe(
      "$.http.fetch: refused: your organization's policy doesn't allow WebFetch",
    );
    expect(fetcher.requests).toEqual([]);
  });

  test('with nonessential traffic off a built-in mod is refused and an installed one fetches', async () => {
    const policy = { fetchPolicy: facts({ disableNonessentialTraffic: true }) };
    const builtIn = await apiHarness({ isBuiltin: true, options: policy });
    expect(await rejection(builtIn.api.http.fetch('https://example.com'))).toBe(
      '$.http.fetch: refused: CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC stops this request',
    );
    const fetcher = scripted(reply(200, 'ok'));
    const installed = await apiHarness({ ports: { fetcher }, options: policy });
    expect(await installed.api.http.fetch('https://example.com')).toMatchObject({ status: 200 });
  });

  test('a redirect is judged too: the host is asked about each request, by its URL and headers', async () => {
    const seen: string[] = [];
    const fetcher = scripted(reply(302, '', { location: 'https://other.example.com/' }));
    const h = await apiHarness({
      ports: { fetcher },
      options: {
        fetchPolicy: (request) => {
          seen.push(request.url);
          return {
            ...open,
            disableNonessentialTraffic: true,
            carriesSessionCredentials: seen.length > 1,
          };
        },
      },
    });
    expect(await rejection(h.api.http.fetch('https://example.com/'))).toContain('refused');
    expect(seen).toEqual(['https://example.com/', 'https://other.example.com/']);
    expect(fetcher.requests).toHaveLength(1);
  });
});
