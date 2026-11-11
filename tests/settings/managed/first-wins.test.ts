/**
 * managed-settings.md § How Claude Code combines managed sources ("first-wins", the default) and
 * § Keys read from every admin source: under the default only the highest-ranked source that
 * delivers a policy key applies, apart from the keys read from every admin source.
 */
import { describe, expect, test } from 'bun:test';
import { composeManaged } from '../../../src/settings/managed/index.ts';
import { compose, document, policyOf } from '../../support/managed.ts';
import { spec } from '../../support/spec.ts';

const COMBINES = 'settingsMerge.managed.How Claude Code combines managed sources';
const CROSS = 'settingsMerge.managed.Keys read from every admin source';

spec([`${COMBINES}."first-wins", the default`, 'policy.server.Settings precedence'], () => {
  const held = {
    remote: { model: 'sonnet', permissions: { allow: ['Bash(remote)'] } },
    file: { model: 'opus', cleanupPeriodDays: 7, permissions: { allow: ['Bash(file)'] } },
  };

  test('the highest-ranked source that delivers a policy key supplies the policy and the rest are ignored', () => {
    const composed = compose(held);
    expect(composed.behavior).toBe('first-wins');
    expect(composed.used).toEqual(['remote']);
    expect(composed.skipped).toEqual(['file']);
    expect(composed.layer.settings.model).toBe('sonnet');
    expect(composed.layer.settings.permissions?.allow).toEqual(['Bash(remote)']);
    expect(composed.layer.settings.cleanupPeriodDays).toBeUndefined();
  });

  test('a key the selected source leaves unset is not read from a lower source', () => {
    expect(
      policyOf({ plist: { model: 'sonnet' }, file: { cleanupPeriodDays: 7 } }).cleanupPeriodDays,
    ).toBe(undefined);
  });

  test('an MDM policy outranks the managed files, which outrank nothing below them', () => {
    expect(compose({ plist: { model: 'a' }, file: { model: 'b' } }).used).toEqual(['plist']);
    expect(compose({ hklm: { model: 'a' }, file: { model: 'b' } }).used).toEqual(['hklm']);
    expect(compose({ file: { model: 'b' }, hkcu: { model: 'c' } }).used).toEqual(['file']);
  });

  test('no warning is shown for a skipped source; /status names the used and the skipped ones', () => {
    const composed = compose(held);
    expect(composed.issues).toEqual([]);
    expect(composed.settingSources).toBe('Enterprise managed settings (remote)');
    expect(composed.skippedSources).toBe('file');
  });

  test('no source delivering a policy key leaves no Setting sources line', () => {
    const composed = compose({ file: { managedSourcesBehavior: 'first-wins' } });
    expect(composed.settingSources).toBeUndefined();
    expect(composed.skippedSources).toBeUndefined();
  });

  test('a key set to "first-wins" in a lower source cannot change what a higher one chose', () => {
    expect(
      compose({ remote: { model: 'a' }, file: { managedSourcesBehavior: 'merge', model: 'b' } })
        .behavior,
    ).toBe('first-wins');
  });
});

spec(CROSS, () => {
  describe('the sources a lower rank still contributes to under "first-wins"', () => {
    test('a key in the list is read from a lower admin source the selected one leaves unset', () => {
      const settings = policyOf({
        remote: { model: 'sonnet' },
        file: { allowAllClaudeAiMcps: true, sandbox: { network: { strictAllowlist: true } } },
      });
      expect(settings.allowAllClaudeAiMcps).toBe(true);
      expect(settings.sandbox?.network?.strictAllowlist).toBe(true);
    });

    test('the user-writable HKCU registry is left out of the scan', () => {
      const settings = policyOf({ file: { model: 'opus' }, hkcu: { allowAllClaudeAiMcps: true } });
      expect(settings.allowAllClaudeAiMcps).toBeUndefined();
    });

    test('a ordinary key of a lower source is still ignored', () => {
      expect(
        policyOf({ remote: { model: 'a' }, file: { cleanupPeriodDays: 3 } }).cleanupPeriodDays,
      ).toBeUndefined();
    });
  });
});

spec(`${CROSS}.sandbox.network.allowManagedDomainsOnly`, () => {
  const lower = {
    sandbox: { network: { allowManagedDomainsOnly: true, allowedDomains: ['file.example'] } },
    permissions: { allow: ['WebFetch(domain:docs.file.example)', 'Bash(ls)'] },
  };
  const upper = {
    model: 'opus',
    sandbox: { network: { allowedDomains: ['remote.example'] } },
    permissions: { allow: ['WebFetch(domain:docs.remote.example)'] },
  };

  test('a true in any admin source turns the lock on', () => {
    expect(policyOf({ remote: upper, file: lower }).sandbox?.network?.allowManagedDomainsOnly).toBe(
      true,
    );
  });

  test('while the lock is on the allowlist unions across every admin source, WebFetch domain rules included', () => {
    const settings = policyOf({ remote: upper, file: lower });
    expect(settings.sandbox?.network?.allowedDomains).toEqual(['remote.example', 'file.example']);
    expect(settings.permissions?.allow).toEqual([
      'WebFetch(domain:docs.remote.example)',
      'WebFetch(domain:docs.file.example)',
    ]);
  });

  test('without the lock an unselected admin source allowlist is ignored', () => {
    const unlocked = { sandbox: { network: { allowedDomains: ['file.example'] } } };
    const settings = policyOf({ remote: upper, file: unlocked });
    expect(settings.sandbox?.network?.allowedDomains).toEqual(['remote.example']);
  });
});

spec(`${CROSS}.sandbox.filesystem.disabled`, () => {
  test('the key is read from a lower admin source when the selected source leaves it unset', () => {
    const settings = policyOf({
      remote: { model: 'a' },
      file: { sandbox: { filesystem: { disabled: true } } },
    });
    expect(settings.sandbox?.filesystem?.disabled).toBe(true);
  });

  test('HKCU is not scanned for it', () => {
    const settings = policyOf({
      file: { model: 'a' },
      hkcu: { sandbox: { filesystem: { disabled: true } } },
    });
    expect(settings.sandbox?.filesystem?.disabled).toBeUndefined();
  });
});

spec(`${CROSS}.allowAllClaudeAiMcps`, () => {
  test('a lower admin source can set it when the selected source does not', () => {
    expect(
      policyOf({ remote: { model: 'a' }, plist: { allowAllClaudeAiMcps: true } })
        .allowAllClaudeAiMcps,
    ).toBe(true);
  });

  test('the selected source is not overridden by a lower one that sets it', () => {
    const settings = policyOf({
      remote: { allowAllClaudeAiMcps: false },
      file: { allowAllClaudeAiMcps: true },
    });
    expect(settings.allowAllClaudeAiMcps).toBe(false);
  });
});

spec(`${CROSS}.allowManagedMcpServersOnly`, () => {
  const allowed = (name: string) => ({ allowedMcpServers: [{ serverName: name }] });

  test('a true in any admin source turns the MCP allowlist lock on', () => {
    const settings = policyOf({
      remote: { model: 'a' },
      file: { allowManagedMcpServersOnly: true },
    });
    expect(settings.allowManagedMcpServersOnly).toBe(true);
  });

  test('while the lock is on the list comes from the highest-ranked admin source that sets one', () => {
    const settings = policyOf({
      remote: { model: 'a', ...allowed('remote') },
      file: { allowManagedMcpServersOnly: true, ...allowed('file') },
    });
    expect(settings.allowedMcpServers).toEqual([{ serverName: 'remote' }]);
  });

  test('a lower source supplies the list when the higher ones set none', () => {
    const settings = policyOf({
      remote: { model: 'a' },
      file: { allowManagedMcpServersOnly: true, ...allowed('file') },
    });
    expect(settings.allowedMcpServers).toEqual([{ serverName: 'file' }]);
  });

  test('without the lock the list is read from the source applied, so an unselected list is ignored', () => {
    const settings = policyOf({ remote: { model: 'a' }, file: allowed('file') });
    expect(settings.allowedMcpServers).toBeUndefined();
  });

  test('no admin source setting a list leaves none, so every server passing the denylist loads', () => {
    const settings = policyOf({
      remote: { allowManagedMcpServersOnly: true },
      file: { model: 'a' },
    });
    expect(settings.allowedMcpServers).toBeUndefined();
  });

  test('/status and claude doctor name a source whose lock or list is not the one in force', () => {
    const composed = compose({
      remote: {
        model: 'a',
        allowedMcpServers: [{ serverName: 'remote' }],
        allowManagedMcpServersOnly: true,
      },
      file: { allowedMcpServers: [{ serverName: 'file' }] },
    });
    expect(composed.notInForce).toEqual([{ index: 1, key: 'allowedMcpServers' }]);
  });
});

spec(`${CROSS}.deniedMcpServers`, () => {
  test('an entry in any admin source applies', () => {
    const settings = policyOf({
      remote: { deniedMcpServers: [{ serverName: 'a' }] },
      file: { deniedMcpServers: [{ serverName: 'b' }, { serverName: 'a' }] },
    });
    expect(settings.deniedMcpServers).toEqual([{ serverName: 'a' }, { serverName: 'b' }]);
  });

  test('HKCU entries are not read', () => {
    const settings = policyOf({
      file: { deniedMcpServers: [{ serverName: 'b' }] },
      hkcu: { deniedMcpServers: [{ serverName: 'c' }] },
    });
    expect(settings.deniedMcpServers).toEqual([{ serverName: 'b' }]);
  });
});

spec(
  [`${CROSS}.env`, 'policy.server.Per-key exceptions across managed sources.The env block'],
  () => {
    const remote = { env: { A: 'remote', DISABLE_TELEMETRY: '1' } };
    const file = { env: { A: 'file', B: 'file' } };

    test('each variable comes from the highest-priority source that defines it, lower sources filling the rest', () => {
      expect(policyOf({ remote, file }).env).toEqual({
        A: 'remote',
        DISABLE_TELEMETRY: '1',
        B: 'file',
      });
    });

    test('a source that is not selected still supplies variables the selected one leaves unset', () => {
      const settings = policyOf({ remote: { model: 'a' }, file });
      expect(settings.env).toEqual({ A: 'file', B: 'file' });
    });

    test('the user-writable HKCU registry is not part of it', () => {
      expect(policyOf({ file, hkcu: { env: { C: 'hkcu' } } }).env).toEqual({
        A: 'file',
        B: 'file',
      });
    });

    test('the same holds under merge', () => {
      const merging = { managedSourcesBehavior: 'merge' };
      expect(policyOf({ remote: { ...remote, ...merging }, file }).env).toEqual({
        A: 'remote',
        DISABLE_TELEMETRY: '1',
        B: 'file',
      });
    });
  },
);

describe('what is read from the documents the host hands over', () => {
  test('composeManaged accepts documents in any order and ranks them itself', () => {
    const low = document('file', { model: 'low' });
    const high = document('remote', { model: 'high' });
    expect(composeManaged([low, high]).layer.settings.model).toBe('high');
  });
});
