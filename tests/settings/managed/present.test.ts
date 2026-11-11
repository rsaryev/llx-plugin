/**
 * managed-settings.md § How Claude Code combines managed sources (policy key, admin source),
 * § When an admin document counts as present, § Find entries Claude Code dropped (what a source
 * holds, what stops Claude Code and what does not).
 */
import { describe, expect, test } from 'bun:test';
import {
  MANAGED_SOURCES,
  SOURCE_TRAITS,
  composeManaged,
  fetchesRemoteSettings,
  readAdminDocument,
  type ManagedSource,
  type SourceRead,
} from '../../../src/settings/managed/index.ts';
import { DENIED, FAILED, compose, document, found } from '../../support/managed.ts';
import { spec } from '../../support/spec.ts';

const COMBINES = 'settingsMerge.managed.How Claude Code combines managed sources';
const DROPPED = 'policy.managed.Find entries Claude Code dropped';

/** errors.md § Managed settings document could not be parsed: the message after the failed source. */
const PARSE_FAILURE =
  'Managed settings document could not be parsed as a JSON object; none of its settings are in effect. Fix or remove it.';

const SOURCES_LINE = (list: string) => `Enterprise managed settings (${list})`;
const used = (held: Parameters<typeof compose>[0]) => compose(held).used;

spec(COMBINES, () => {
  test('the sources rank remote settings, MDM or OS policy, managed files, then the HKCU registry', () => {
    const all = compose({
      remote: { model: 'remote' },
      plist: { model: 'plist' },
      file: { model: 'file' },
      hkcu: { model: 'hkcu' },
    });
    expect(all.used).toEqual(['remote']);
    expect(all.skipped).toEqual(['plist', 'file', 'hkcu']);
    expect(
      compose({ plist: { model: 'plist' }, file: { model: 'file' }, hkcu: { model: 'hkcu' } }).used,
    ).toEqual(['plist']);
  });

  test('/status names the source Claude Code used and the ones it skipped', () => {
    expect(compose({ plist: { model: 'a' } }).settingSources).toBe(SOURCES_LINE('plist'));
    expect(compose({ hklm: { model: 'a' } }).settingSources).toBe(SOURCES_LINE('HKLM'));
    expect(compose({ hkcu: { model: 'a' } }).settingSources).toBe(SOURCES_LINE('HKCU'));
    expect(compose({ remote: { model: 'a' }, hkcu: { model: 'b' } }).skippedSources).toBe('HKCU');
  });

  test('the HKCU registry stays out of the ranking while an admin document is present', () => {
    expect(compose({ file: { model: 'a' }, hkcu: { model: 'b' } }).skipped).toEqual(['hkcu']);
  });

  test('an embedding host that supplied restrictive settings is named when no managed source applies', () => {
    expect(compose({}, true).settingSources).toBe(SOURCES_LINE('parent process'));
  });

  describe('remote settings are fetched only when the session can use them', () => {
    const base = {
      eligibleCredential: false,
      anthropicProvider: true,
      baseUrlElsewhere: false,
      gatewayLogin: false,
      desktopGatewaySession: false,
    };

    test('an eligible credential to Anthropic API, a gateway /login, or Desktop behind a gateway', () => {
      expect(fetchesRemoteSettings({ ...base, eligibleCredential: true })).toBe(true);
      expect(fetchesRemoteSettings({ ...base, gatewayLogin: true })).toBe(true);
      expect(fetchesRemoteSettings({ ...base, desktopGatewaySession: true })).toBe(true);
    });

    test('other providers, or a base URL other than Anthropic API, start at the next source', () => {
      expect(fetchesRemoteSettings(base)).toBe(false);
      expect(
        fetchesRemoteSettings({ ...base, eligibleCredential: true, anthropicProvider: false }),
      ).toBe(false);
      expect(
        fetchesRemoteSettings({ ...base, eligibleCredential: true, baseUrlElsewhere: true }),
      ).toBe(false);
    });
  });
});

spec(`${COMBINES}.Policy key`, () => {
  test('a source with only the two control keys is not a policy and the next source supplies it', () => {
    const composed = compose({
      remote: { managedSourcesBehavior: 'first-wins', wslInheritsWindowsSettings: true },
      file: { model: 'opus' },
    });
    expect(composed.used).toEqual(['file']);
    expect(composed.layer.settings.model).toBe('opus');
  });

  test('any other key makes a source a policy', () => {
    expect(used({ remote: { model: 'sonnet' }, file: { model: 'opus' } })).toEqual(['remote']);
  });

  test('a key set to null is not delivered', () => {
    expect(used({ remote: { model: null }, file: { model: 'opus' } })).toEqual(['file']);
  });

  test('the control keys never reach the managed settings', () => {
    const { settings } = compose({
      file: { model: 'opus', managedSourcesBehavior: 'merge', wslInheritsWindowsSettings: true },
    }).layer;
    expect(settings.model).toBe('opus');
    expect('managedSourcesBehavior' in settings).toBe(false);
    expect('wslInheritsWindowsSettings' in settings).toBe(false);
  });
});

spec(`${COMBINES}.Admin source`, () => {
  test('remote settings, MDM policies and the managed files are admin sources; HKCU is not', () => {
    const admin = MANAGED_SOURCES.filter((source) => SOURCE_TRAITS[source].admin);
    expect(admin.toSorted()).toEqual(['file', 'hklm', 'plist', 'remote']);
  });

  test('the sources rank remote above MDM above the files above HKCU', () => {
    const rank = (source: ManagedSource) => SOURCE_TRAITS[source].rank;
    expect(rank('remote')).toBeGreaterThan(rank('plist'));
    expect(rank('plist')).toBe(rank('hklm'));
    expect(rank('hklm')).toBeGreaterThan(rank('file'));
    expect(rank('file')).toBeGreaterThan(rank('hkcu'));
  });

  test('HKCU never merges with another source', () => {
    const composed = compose({
      file: { managedSourcesBehavior: 'merge', permissions: { allow: ['Bash(a)'] } },
      hkcu: { permissions: { allow: ['Bash(b)'] } },
    });
    expect(composed.layer.settings.permissions?.allow).toEqual(['Bash(a)']);
    expect(composed.used).toEqual(['file']);
  });
});

spec('settingsMerge.managed.When an admin document counts as present', () => {
  const present = (source: ManagedSource, read: SourceRead) =>
    readAdminDocument(source, read).present;

  test('a policy key set to a value other than null makes a document present', () => {
    expect(present('file', found({ model: 'opus' }))).toBe(true);
    expect(present('file', found({ model: null }))).toBe(false);
    expect(present('file', found({}))).toBe(false);
  });

  test('a value Claude Code cannot read still counts', () => {
    expect(present('hklm', found('{"permissions": 7}'))).toBe(true);
    expect(present('plist', found({ model: 12 }))).toBe(true);
  });

  test('an HKLM value, file or drop-in directory that exists but cannot be read is present', () => {
    expect(present('hklm', DENIED)).toBe(true);
    expect(present('file', FAILED)).toBe(true);
    expect(present('plist', DENIED)).toBe(true);
  });

  test('an absent source is not present', () => {
    expect(present('file', undefined)).toBe(false);
  });

  test('HKCU is never applied beneath a present admin document', () => {
    const hkcu = { model: 'haiku' };
    expect(used({ file: { model: 'opus' }, hkcu })).toEqual(['file']);
    expect(composeManaged([document('hklm', {}), document('hkcu', hkcu)]).used).toEqual(['hkcu']);
    const unreadable = readAdminDocument('hklm', DENIED);
    expect(composeManaged([unreadable, document('hkcu', hkcu)]).used).toEqual([]);
  });

  test('HKCU applies when it is the only source and no host supplies a restrictive parent key', () => {
    expect(used({ hkcu: { model: 'haiku' } })).toEqual(['hkcu']);
    expect(compose({ hkcu: { model: 'haiku' } }, true).used).toEqual([]);
  });
});

spec(
  [
    `${DROPPED}.Managed settings file or drop-in file`,
    'cli.errors.Managed settings document could not be parsed',
  ],
  () => {
    test('a file that is not valid JSON, or whose top level is not an object, stops Claude Code', () => {
      for (const text of ['{ not json', '[1, 2]', '"text"', '7']) {
        const read = readAdminDocument(
          'file',
          found(text),
          '/etc/claude-code/managed-settings.json',
        );
        expect(read.broken).toBe(true);
        expect(read.issues[0]?.severity).toBe('error');
        expect(read.issues[0]?.message).toStartWith(
          `/etc/claude-code/managed-settings.json: ${PARSE_FAILURE}`,
        );
      }
    });

    test('it stops Claude Code even when another admin source delivers a valid policy', () => {
      const composed = composeManaged([
        document('remote', { model: 'opus' }),
        readAdminDocument('file', found('{ nope')),
      ]);
      expect(composed.fatal).toBe(true);
    });

    test('an empty file counts as {} and an absent one is not a failure', () => {
      const empty = readAdminDocument('file', found(''));
      expect(empty.broken).toBe(false);
      expect(empty.delivers).toBe(false);
      expect(composeManaged([empty]).fatal).toBe(false);
      expect(composeManaged([readAdminDocument('file', undefined)]).fatal).toBe(false);
    });
  },
);

spec(`${DROPPED}.MDM plist`, () => {
  test('a plist plutil reports malformed, or whose converted content is not an object, stops Claude Code', () => {
    expect(readAdminDocument('plist', { malformed: 'Property List error' }).broken).toBe(true);
    expect(readAdminDocument('plist', found('[1]')).broken).toBe(true);
    expect(readAdminDocument('plist', found('{"model":"opus"}')).broken).toBe(false);
  });
});

spec(`${DROPPED}.HKLM registry value`, () => {
  test('a Settings value that is not a string, is empty, or holds no object stops Claude Code', () => {
    for (const value of [7, '', '[1]', '{ oops']) {
      expect(readAdminDocument('hklm', found(value)).broken).toBe(true);
    }
    expect(readAdminDocument('hklm', found('{"model":"opus"}')).broken).toBe(false);
  });
});

spec(DROPPED, () => {
  describe('entries Claude Code can repair', () => {
    test('one invalid permission rule is skipped with a warning and the valid ones apply', () => {
      const read = readAdminDocument(
        'file',
        found({ permissions: { deny: ['Read(./.env)', 42] } }),
      );
      expect(read.settings.permissions?.deny).toEqual(['Read(./.env)']);
      expect(read.issues.some((issue) => issue.severity === 'warning')).toBe(true);
      expect(read.broken).toBe(false);
    });
  });

  describe('a malformed value in the user-writable HKCU key', () => {
    test('never blocks launch and is reported as a notice', () => {
      const read = readAdminDocument('hkcu', found('{ nope'));
      expect(read.broken).toBe(false);
      expect(read.issues).toHaveLength(1);
      expect(read.issues[0]?.severity).toBe('warning');
      expect(composeManaged([read]).fatal).toBe(false);
    });
  });

  describe('a source that exists but cannot be read, with no admin source supplying a policy', () => {
    test('a denied read starts the session without that source and records the failure', () => {
      const composed = composeManaged([readAdminDocument('file', DENIED)]);
      expect(composed.fatal).toBe(false);
      expect(composed.issues).toHaveLength(1);
      expect(composed.issues[0]?.severity).toBe('warning');
    });

    test('any other failure exits at startup with a message to contact an administrator', () => {
      const composed = composeManaged([readAdminDocument('hklm', FAILED)]);
      expect(composed.fatal).toBe(true);
      expect(composed.issues[0]?.severity).toBe('error');
      expect(composed.issues[0]?.message).toContain('Contact your administrator');
    });

    test('when another admin source supplies a policy the failure is not an exit', () => {
      const composed = composeManaged([
        document('remote', { model: 'opus' }),
        readAdminDocument('file', FAILED),
      ]);
      expect(composed.fatal).toBe(false);
    });
  });
});
