/**
 * errors.md § Managed settings document could not be parsed (`<source>: <message>`, the source
 * being the file path, `per-user managed preferences` or `Registry: HKLM\...`) and § Unable to read
 * managed policy settings (the three-line exit with `Detail: <source>: <reason>`); managed-settings.md
 * § Find entries Claude Code dropped (a denied read starts the session without the source, any other
 * failure exits).
 */
import { describe, expect, test } from 'bun:test';
import {
  composeManaged,
  readAdminDocument,
  readFileDocument,
  type ManagedSource,
  type SourceRead,
} from '../../../src/settings/managed/index.ts';
import { DENIED, FAILED, found } from '../../support/managed.ts';
import { spec } from '../../support/spec.ts';

const DROPPED = 'policy.managed.Find entries Claude Code dropped';

const PARSE_FAILURE =
  'Managed settings document could not be parsed as a JSON object; none of its settings are in effect. Fix or remove it.';
const NOT_OBJECT = 'its top level is not a JSON object';

const FILE = '/Library/Application Support/ClaudeCode/managed-settings.json';
const HKLM = 'Registry: HKLM\\SOFTWARE\\Policies\\ClaudeCode\\Settings';

/** What a failed read at `source` reports, with the host's label for it. */
const reported = (source: ManagedSource, read: SourceRead, label: string) =>
  readAdminDocument(source, read, label).issues.map((issue) => [issue.severity, issue.message]);

spec(`${DROPPED}.Managed settings file or drop-in file`, () => {
  test('a managed file that is not an object names its path before the documented message', () => {
    expect(reported('file', found('[1, 2]'), FILE)).toEqual([
      ['error', `${FILE}: ${PARSE_FAILURE} (${NOT_OBJECT})`],
    ]);
  });

  test('a drop-in that is not an object names its own path', () => {
    const path = '/etc/claude-code/managed-settings.d/10-bad.json';
    const merged = readFileDocument({
      base: { value: { model: 'a' } },
      dropIns: { files: [{ name: '10-bad.json', read: { value: '"text"' } }] },
      label: { dropIn: (name) => `/etc/claude-code/managed-settings.d/${name}` },
    });
    expect(merged.issues.map((issue) => [issue.severity, issue.message])).toEqual([
      ['error', `${path}: ${PARSE_FAILURE} (${NOT_OBJECT})`],
    ]);
  });
});

spec(`${DROPPED}.MDM plist`, () => {
  test('a plist names its managed preferences profile before the documented message', () => {
    expect(
      reported('plist', { malformed: 'Property List error' }, 'per-user managed preferences'),
    ).toEqual([['error', `per-user managed preferences: ${PARSE_FAILURE} (Property List error)`]]);
    expect(reported('plist', found('[1]'), 'device-level managed preferences')).toEqual([
      ['error', `device-level managed preferences: ${PARSE_FAILURE} (${NOT_OBJECT})`],
    ]);
  });
});

spec(`${DROPPED}.HKLM registry value`, () => {
  test('a registry value names its key before the documented message', () => {
    expect(reported('hklm', found('[1]'), HKLM)).toEqual([
      ['error', `${HKLM}: ${PARSE_FAILURE} (${NOT_OBJECT})`],
    ]);
    expect(reported('hklm', found(''), HKLM)).toEqual([
      ['error', `${HKLM}: ${PARSE_FAILURE} (the Settings value is empty)`],
    ]);
  });
});

/** The `Detail:` line of the exit a file read that failed comes to. */
const detail = (label?: string) =>
  composeManaged([readAdminDocument('file', FAILED, label)]).issues[0]?.message.split('\n')[4];

spec(DROPPED, () => {
  test('a source that cannot be read, with no policy elsewhere, exits with the three lines and a Detail line', () => {
    const composed = composeManaged([readAdminDocument('hklm', FAILED, HKLM)]);
    expect(composed.fatal).toBe(true);
    expect(composed.issues).toEqual([
      {
        severity: 'error',
        path: 'managed:',
        message: [
          'Unable to read managed policy settings.',
          'This machine may require organization login enforcement, but the policy file failed to load.',
          'Contact your administrator.',
          '',
          `Detail: ${HKLM}: ${FAILED.reason}`,
        ].join('\n'),
      },
    ]);
  });

  test('the Detail line names the file path the host gives, else the source label', () => {
    expect(detail(FILE)).toBe(`Detail: ${FILE}: ${FAILED.reason}`);
    expect(detail()).toBe(`Detail: file: ${FAILED.reason}`);
  });

  test('a file split across drop-ins reports the file that failed', () => {
    const path = '/etc/claude-code/managed-settings.d/20-b.json';
    const merged = readFileDocument({
      base: { value: { model: 'a' } },
      dropIns: { files: [{ name: '20-b.json', read: FAILED }] },
      label: { dropIn: (name) => `/etc/claude-code/managed-settings.d/${name}` },
    });
    expect(merged.unreadableAt).toEqual({ label: path, reason: FAILED.reason });
  });
});

describe('the wording of a denied read (spec/judgments.md)', () => {
  test('it is a warning that names the source, the reason and what the session does', () => {
    const composed = composeManaged([readAdminDocument('file', DENIED, FILE)]);
    expect(composed.fatal).toBe(false);
    expect(composed.issues).toEqual([
      {
        severity: 'warning',
        path: 'managed:',
        message: `${FILE}: ${DENIED.reason}: the operating system denied the read, so this session starts without that source's policies`,
      },
    ]);
  });
});
