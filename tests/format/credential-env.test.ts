/**
 * mcp.md § Credential variables that read as empty: the covered names, the rule that a covered name
 * reads as empty toward a remote server whether or not it is set, and the debug line that names a
 * covered variable the user has set ("never expanded toward a remote server").
 */
import { describe, expect, test } from 'bun:test';
import {
  CREDENTIAL_ENV_NAMES,
  NOT_EXPANDED_TOWARD_REMOTE,
  credentialDebugLine,
  readsAsEmptyTowardRemote,
} from '../../src/format/credential-env.ts';
import { spec } from '../support/spec.ts';

spec('mcpSettings.behavior.Credential variables that read as empty', () => {
  test('the names the page writes are covered', () => {
    expect([...CREDENTIAL_ENV_NAMES].toSorted()).toEqual([
      'ANTHROPIC_API_KEY',
      'ANTHROPIC_AUTH_TOKEN',
      'AWS_BEARER_TOKEN_BEDROCK',
      'HTTPS_PROXY',
      'NPM_TOKEN',
    ]);
    for (const name of CREDENTIAL_ENV_NAMES) expect(readsAsEmptyTowardRemote(name)).toBe(true);
  });

  test('a provider base URL and a name outside the set expand as written', () => {
    expect(readsAsEmptyTowardRemote('ANTHROPIC_BASE_URL')).toBe(false);
    expect(readsAsEmptyTowardRemote('API_KEY')).toBe(false);
  });

  test('the debug line holds the phrase the page tells the reader to search for and the name', () => {
    expect(NOT_EXPANDED_TOWARD_REMOTE).toBe('never expanded toward a remote server');
    const line = credentialDebugLine('NPM_TOKEN');
    expect(line).toContain('never expanded toward a remote server');
    expect(line).toContain('NPM_TOKEN');
  });
});

describe('credential names (judgment)', () => {
  test('names are matched exactly: case differs, so another name is not covered', () => {
    // Judgment: environment names are case-sensitive on the hosts the docs describe.
    expect(readsAsEmptyTowardRemote('npm_token')).toBe(false);
  });
});
