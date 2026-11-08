/**
 * What the managed-sources code decides where the docs are silent (spec/judgments.md): each case
 * names its judgment and is not under spec(), so none of it counts as compatibility.
 */
import { describe, expect, test } from 'bun:test';
import {
  dropInOrder,
  helperPathFault,
  readAdminDocument,
  readHelperOutput,
} from '../../../src/settings/managed/index.ts';
import { FAILED, compose, found, policyOf } from '../../support/managed.ts';

describe('judgments', () => {
  test('drop-ins sort by code unit, so an upper-case name precedes a lower-case one', () => {
    expect(dropInOrder(['a.json', 'B.json', '10.json'])).toEqual(['10.json', 'B.json', 'a.json']);
  });

  test('a policyHelper path with an empty segment or a trailing separator is not normalized', () => {
    expect(helperPathFault('/usr//bin/p', 'posix')).toContain('normalized');
    expect(helperPathFault('/usr/bin/', 'posix')).toContain('normalized');
  });

  test('a Windows helper path may use either separator', () => {
    expect(helperPathFault('C:/Tools/claude-policy.exe', 'windows')).toBeUndefined();
  });

  test('a key the managed source does not read is not a schema violation in a helper output', () => {
    const output = readHelperOutput(
      JSON.stringify({ managedSettings: { model: 'a', autoConnectIde: true } }),
      '',
    );
    expect(output).toMatchObject({ settings: { model: 'a' } });
  });

  test('the cross-source keys without a stated combination take the highest admin source that sets them', () => {
    const settings = policyOf({
      remote: { allowAllClaudeAiMcps: false, sandbox: { filesystem: { disabled: false } } },
      file: { allowAllClaudeAiMcps: true, sandbox: { filesystem: { disabled: true } } },
    });
    expect(settings.allowAllClaudeAiMcps).toBe(false);
    expect(settings.sandbox?.filesystem?.disabled).toBe(false);
  });

  test('a lock key outside the four the docs name restricts like them under merge', () => {
    const settings = policyOf({
      remote: { managedSourcesBehavior: 'merge', disableSideloadFlags: false },
      file: { disableSideloadFlags: true, disableCommandPluginSources: true },
    });
    expect(settings.disableSideloadFlags).toBe(true);
    expect(settings.disableCommandPluginSources).toBe(true);
  });

  test('a block with no row of the table merges key by key under merge', () => {
    const settings = policyOf({
      remote: { managedSourcesBehavior: 'merge', sandbox: { enabled: true } },
      file: { sandbox: { failIfUnavailable: true } },
    });
    expect(settings.sandbox).toMatchObject({ enabled: true, failIfUnavailable: true });
  });

  test('skipped sources are listed by their /status label, highest first', () => {
    const composed = compose({ plist: { model: 'a' }, file: { model: 'b' }, hkcu: { model: 'c' } });
    expect(composed.skippedSources).toBe('file, HKCU');
  });

  test('an unreadable HKCU registry never blocks launch and makes no document present', () => {
    const read = readAdminDocument('hkcu', FAILED);
    expect(read.present).toBe(false);
    expect(read.broken).toBe(false);
  });

  test('a registry value is text; an object there is a value of the wrong type', () => {
    expect(readAdminDocument('hklm', found({ model: 'a' })).broken).toBe(true);
  });
});
