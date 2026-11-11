/**
 * managed-settings.md § Let an embedding host add policy: "Claude Code enforces the
 * `forceLoginOrgUUID` or `allowedMcpServers` value in the managed settings it applies and blocks a
 * parent-supplied one"; "while `allowManagedMcpServersOnly` is on, the `allowedMcpServers` list from
 * the highest-ranked admin source that sets one applies and blocks the parent's ... The parent's list
 * applies only when no admin source sets one"; "For `availableModels`, Claude Code enforces the value
 * in the managed settings it applies and blocks a parent-supplied list".
 * managed-settings.md § Keys only a managed source can set: `allowManagedDomainsOnly`, "Honor only
 * managed `allowedDomains`"; `allowManagedReadPathsOnly`, "only `filesystem.allowRead` paths from
 * managed settings are respected".
 *
 * The view's `get` and `merged()` answer what the area policies enforce: the key row says how the
 * admin tier holds the key, and every reader goes through the view.
 */
import { expect, test } from 'bun:test';
import type { Settings } from '../../../src/protocol/official.ts';
import {
  createGeneralView,
  createPolicyView,
  type PolicyLayer,
  type PolicyScope,
} from '../../../src/entry/settings.ts';
import { readMcpLists } from '../../../src/settings/mcp/lists.ts';
import { spec } from '../../support/spec.ts';

const layer = (scope: PolicyScope, settings: Settings): PolicyLayer => ({ scope, settings });
const serverName = (entry: unknown): unknown =>
  typeof entry === 'object' && entry !== null && 'serverName' in entry
    ? entry.serverName
    : undefined;
const names = (list: unknown): unknown => (Array.isArray(list) ? list.map(serverName) : list);

spec('policy.managed.Let an embedding host add policy', () => {
  test('under allowManagedMcpServersOnly the highest admin list alone is the allowlist the view reports', () => {
    const view = createPolicyView([
      layer('managed', {
        allowManagedMcpServersOnly: true,
        allowedMcpServers: [{ serverName: 'a' }],
      }),
      layer('managed', { allowedMcpServers: [{ serverName: 'b' }] }),
      layer('user', { allowedMcpServers: [{ serverName: 'u' }] }),
    ]);
    expect(names(view.get('allowedMcpServers'))).toEqual(['a']);
    expect(readMcpLists(view).allowed?.serverName.map((entry) => entry.value)).toEqual(['a']);
  });

  test('without the lock a managed list blocks the parent list and the user list still adds', () => {
    const view = createPolicyView([
      layer('managed', { allowedMcpServers: [{ serverName: 'a' }] }),
      layer('parent', { allowedMcpServers: [{ serverName: 'p' }] }),
      layer('user', { allowedMcpServers: [{ serverName: 'u' }] }),
    ]);
    expect(names(view.get('allowedMcpServers'))).toEqual(['a', 'u']);
  });

  test('a managed availableModels blocks the parent list', () => {
    const view = createPolicyView([
      layer('managed', { availableModels: ['sonnet'] }),
      layer('parent', { availableModels: ['opus'] }),
      layer('user', { availableModels: ['haiku'] }),
    ]);
    expect(view.get('availableModels')).toEqual(['sonnet']);
  });

  test('with no admin list the parent availableModels applies as the managed one', () => {
    const view = createPolicyView([
      layer('parent', { availableModels: ['opus'] }),
      layer('user', { availableModels: ['haiku'] }),
    ]);
    expect(view.get('availableModels')).toEqual(['opus']);
  });
});

spec(
  'policy.managed.Keys only a managed source can set.sandbox.network.allowManagedDomainsOnly',
  () => {
    test('the merged settings keep only the managed allowedDomains', () => {
      const merged = createGeneralView([
        layer('managed', {
          sandbox: { network: { allowManagedDomainsOnly: true, allowedDomains: ['corp.com'] } },
        }),
        layer('user', { sandbox: { network: { allowedDomains: ['evil.com'] } } }),
      ]).merged();
      expect(merged.sandbox?.network?.allowedDomains).toEqual(['corp.com']);
    });

    test('without the lock the lists of every file merge', () => {
      const merged = createGeneralView([
        layer('managed', { sandbox: { network: { allowedDomains: ['corp.com'] } } }),
        layer('user', { sandbox: { network: { allowedDomains: ['dev.com'] } } }),
      ]).merged();
      expect(merged.sandbox?.network?.allowedDomains).toEqual(['corp.com', 'dev.com']);
    });
  },
);

test('allowManagedReadPathsOnly: the merged settings keep only the managed allowRead paths', () => {
  const merged = createGeneralView([
    layer('managed', {
      sandbox: { filesystem: { allowManagedReadPathsOnly: true, allowRead: ['/corp'] } },
    }),
    layer('project', { sandbox: { filesystem: { allowRead: ['/home'] } } }),
  ]).merged();
  expect(merged.sandbox?.filesystem?.allowRead).toEqual(['/corp']);
});
