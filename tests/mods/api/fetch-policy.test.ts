/** plugins/mods/admin.md § Know which controls still apply, "Network policy covers `$.http.fetch`". */
import { expect, test } from 'bun:test';
import { modFetchVerdict, type ModFetchFacts } from '../../../src/mods/api/index.ts';
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
