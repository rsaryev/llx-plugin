/**
 * `policyContext`: the facts a host leaves out take the value that grants the least
 * (spec/judgments.md); a fact the host passes is kept as it is.
 */
import { describe, expect, test } from 'bun:test';
import { policyContext } from '../../src/settings/index.ts';

describe('judgments: policyContext', () => {
  test('nothing passed: an API-key account, nothing trusted, no managed settings, the official marketplace', () => {
    const context = policyContext();
    expect(context.account).toBe('console');
    expect(context.plan).toEqual({ pro: false });
    expect(context.hasManagedSettings).toBe(false);
    expect(context.parentMerge).toBe(false);
    expect(context.isFolderTrusted('project')).toBe(false);
    expect(context.env).toEqual({});
    expect(context.defaultChannelAllowlist).toEqual([]);
    expect(context.officialMarketplaces).toEqual(['claude-plugins-official']);
  });

  test('a fact the host passes replaces the default', () => {
    const context = policyContext({ isFolderTrusted: () => true, env: { A: '1' } });
    expect(context.isFolderTrusted('local')).toBe(true);
    expect(context.env).toEqual({ A: '1' });
    expect(context.account).toBe('console');
  });
});
