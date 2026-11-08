/**
 * settings-reference.md § `allowedChannelPlugins` (Scope "Managed"; "When you set it, Claude Code
 * uses your list in place of the default Anthropic allowlist"; the string form
 * `"plugin@marketplace"` "treats as the equivalent object"; "An empty array blocks every channel
 * plugin"; "takes effect once channels pass the `channelsEnabled` gate"), channels.md § Restrict
 * which channel plugins can run ("If you set an empty array, you block all channel plugins from the
 * allowlist, but `--dangerously-load-development-channels` can still bypass that block ... To block
 * channels entirely including the development flag, leave `channelsEnabled` unset"; "This setting
 * requires `channelsEnabled: true`"; the channel "doesn't register" for a plugin not on the list),
 * § Research preview ("Anthropic-maintained allowlist ... or your organization's allowlist"),
 * channels-reference.md § Test during the research preview (the bypass is per-entry; "in
 * non-interactive mode ... Claude Code ignores the flag and the channel doesn't register"),
 * managed-settings.md § Restriction allowlists ("Takes the list whole from the highest-ranked source
 * that sets it") and the invalid-value table ("enforces an empty allowlist until you fix the value ...
 * If only an individual entry is invalid, it strips that entry and enforces the rest").
 */
import { expect, test } from 'bun:test';
import {
  createChannelSettingsPolicy,
  effectiveChannelAllowlist,
  type ChannelPolicyContext,
} from '../../../src/settings/channels/index.ts';
import { viewOf, type Source } from '../../support/plugin-settings.ts';
import { spec } from '../../support/spec.ts';

const official = 'claude-plugins-official';
const telegram = { plugin: 'telegram', marketplace: official };
const discord = { plugin: 'discord', marketplace: official };
const internal = { plugin: 'internal-alerts', marketplace: 'acme-corp-plugins' };
const context: ChannelPolicyContext = {
  account: 'claudeaiTeamEnterprise',
  hasManagedSettings: true,
  defaultChannelAllowlist: [telegram, discord],
};
const on = { channelsEnabled: true };
const managed = (settings: Record<string, unknown>): Source => ['managed', { ...on, ...settings }];
const policyOf = (...sources: readonly Source[]) =>
  createChannelSettingsPolicy(viewOf(...sources), context);
const dev = { development: { interactive: true } };

spec('settings.key.allowedChannelPlugins', () => {
  test('unset: the default allowlist applies', () => {
    const policy = policyOf(['managed', on]);
    expect(policy.allowlist().source).toBe('default');
    expect(policy.allowed(telegram)).toEqual({ allowed: true, reason: 'defaultAllowlist' });
    expect(policy.allowed(internal)).toEqual({ allowed: false, reason: 'notOnDefaultList' });
  });

  test('set: the list replaces the default instead of adding to it', () => {
    const policy = policyOf(managed({ allowedChannelPlugins: [telegram, internal] }));
    expect(policy.allowlist().source).toBe('organization');
    expect(policy.allowed(internal)).toEqual({ allowed: true, reason: 'organizationAllowlist' });
    expect(policy.allowed(telegram).allowed).toBe(true);
    expect(policy.allowed(discord)).toEqual({ allowed: false, reason: 'notOnOrganizationList' });
  });

  test('the string "plugin@marketplace" is the equivalent object', () => {
    const asString = policyOf(
      managed({ allowedChannelPlugins: ['telegram@claude-plugins-official'] }),
    );
    const asObject = policyOf(managed({ allowedChannelPlugins: [telegram] }));
    expect(asString.allowlist()).toEqual(asObject.allowlist());
    expect(asString.allowed(telegram).allowed).toBe(true);
    expect(asString.allowed(discord).allowed).toBe(false);
  });

  test('both names must match: the same plugin from another marketplace is not on the list', () => {
    const policy = policyOf(managed({ allowedChannelPlugins: [telegram] }));
    expect(policy.allowed({ plugin: 'telegram', marketplace: 'acme-corp-plugins' }).allowed).toBe(
      false,
    );
    expect(policy.allowed({ plugin: 'other', marketplace: official }).allowed).toBe(false);
  });

  test('an empty array blocks every channel plugin but not the development flag', () => {
    const policy = policyOf(managed({ allowedChannelPlugins: [] }));
    expect(policy.allowed(telegram)).toEqual({ allowed: false, reason: 'notOnOrganizationList' });
    expect(policy.allowed(internal, dev)).toEqual({ allowed: true, reason: 'developmentFlag' });
  });

  test('it requires channelsEnabled: true, and without it nothing registers, development flag included', () => {
    const policy = policyOf(['managed', { allowedChannelPlugins: [telegram] }]);
    expect(policy.allowed(telegram)).toEqual({ allowed: false, reason: 'channelsNotEnabled' });
    expect(policy.allowed(telegram, dev)).toEqual({ allowed: false, reason: 'channelsNotEnabled' });
    const empty = policyOf(['managed', { allowedChannelPlugins: [] }]);
    expect(empty.allowed(internal, dev).allowed).toBe(false);
  });

  test('the bypass is per entry: a plugin passed to --channels still faces the list', () => {
    const policy = policyOf(managed({ allowedChannelPlugins: [telegram] }));
    expect(policy.allowed(internal, dev).allowed).toBe(true);
    expect(policy.allowed(internal).allowed).toBe(false);
  });

  test('the development flag is ignored outside an interactive session', () => {
    const policy = policyOf(managed({ allowedChannelPlugins: [] }));
    const verdict = policy.allowed(internal, { development: { interactive: false } });
    expect(verdict).toEqual({ allowed: false, reason: 'developmentFlagNeedsInteractive' });
  });

  test('managed only: a list in user, project, local or flag settings changes nothing', () => {
    for (const scope of ['user', 'project', 'local', 'flag'] as const) {
      const policy = policyOf(managed({}), [scope, { allowedChannelPlugins: [internal] }]);
      expect(policy.allowlist().source).toBe('default');
      expect(policy.allowed(internal).allowed).toBe(false);
    }
  });

  test('the highest managed source owns the list whole: lower sources add nothing', () => {
    const policy = policyOf(
      managed({ allowedChannelPlugins: [telegram] }),
      managed({ allowedChannelPlugins: [internal] }),
    );
    expect(policy.allowed(telegram).allowed).toBe(true);
    expect(policy.allowed(internal).allowed).toBe(false);
  });

  test('an unusable value is an empty allowlist until fixed: nothing is admitted', () => {
    for (const bad of ['telegram@claude-plugins-official', { plugin: 'telegram' }, 3, true]) {
      const policy = policyOf(managed({ allowedChannelPlugins: bad }));
      expect(policy.allowlist()).toMatchObject({ source: 'organization', entries: [] });
      expect(policy.allowed(telegram).allowed).toBe(false);
      expect(policy.allowed(telegram, dev).allowed).toBe(true);
    }
  });

  test('an invalid entry is stripped and the rest is enforced', () => {
    const policy = policyOf(
      managed({
        allowedChannelPlugins: [telegram, 'no-at-sign', { marketplace: official }, 7, internal],
      }),
    );
    expect(policy.allowlist().entries).toEqual([telegram, internal]);
    expect(policy.allowed(internal).allowed).toBe(true);
    expect(policy.allowed(discord).allowed).toBe(false);
  });
});

test('effectiveChannelAllowlist hands back the default untouched when no file sets the key', () => {
  const list = effectiveChannelAllowlist(viewOf(['managed', on]), context);
  expect(list).toEqual({ source: 'default', entries: [telegram, discord] });
});

test('judgment: Pro, Max and Ultra skip the two managed keys, so the default allowlist still applies', () => {
  const personal: ChannelPolicyContext = {
    ...context,
    account: 'claudeaiPersonal',
    hasManagedSettings: false,
  };
  const policy = createChannelSettingsPolicy(
    viewOf(['managed', { allowedChannelPlugins: [internal] }]),
    personal,
  );
  expect(policy.allowlist().source).toBe('default');
  expect(policy.allowed(telegram)).toEqual({ allowed: true, reason: 'defaultAllowlist' });
  expect(policy.allowed(internal).allowed).toBe(false);
});

test('judgment: plugin and marketplace names compare exactly, including case', () => {
  const policy = policyOf(managed({ allowedChannelPlugins: [telegram] }));
  expect(policy.allowed({ plugin: 'Telegram', marketplace: official }).allowed).toBe(false);
});
