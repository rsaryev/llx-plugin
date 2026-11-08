/**
 * mcp.md § Credential variables that read as empty: the covered names, the rule that a covered name
 * reads as empty toward a remote server whether or not it is set, and the debug line that names a
 * covered variable the user has set ("never expanded toward a remote server").
 */
import { describe, expect, test } from 'bun:test';
import {
  CREDENTIAL_ENV_NAMES,
  FIXED_CREDENTIAL_NAMES,
  NOT_EXPANDED_TOWARD_REMOTE,
  credentialDebugLine,
  hasUrlPassword,
  isCredentialVariable,
  readsAsEmptyTowardRemote,
  scrubAction,
  withoutCredentials,
  withoutUserinfo,
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

describe('credential names (oracle 2.1.319)', () => {
  test('scoped MCP uses the same case-insensitive rule as plugin MCP', () => {
    expect(readsAsEmptyTowardRemote('npm_token')).toBe(true);
    expect(readsAsEmptyTowardRemote('Http_Proxy')).toBe(true);
    expect(readsAsEmptyTowardRemote('X_NPM_TOKEN')).toBe(false);
  });
});

/**
 * One credential classifier for every process the kit starts for a command it may not have written
 * (mcp.md § Which variables a helper can read; env-vars.md § What the subprocess environment scrub
 * removes). The documented behaviour is proven in tests/loading/resolve/headers-helper.test.ts and
 * subprocess-scrub.test.ts; these tests pin the classifier they share.
 */
describe('the credential name classifier', () => {
  test('a name with TOKEN, SECRET, PASSWORD, KEY or AUTH in it, in either letter case, is a credential', () => {
    for (const name of [
      'ANTHROPIC_API_KEY',
      'MY_REGISTRY_TOKEN',
      'db_password',
      'Client_Secret',
      'AWS_AUTH_FILE',
    ]) {
      expect(isCredentialVariable(name)).toBe(true);
    }
  });

  test('Git GIT_CONFIG_KEY_<n> is the one exception; the bare name and other Git names are not', () => {
    expect(isCredentialVariable('GIT_CONFIG_KEY_0')).toBe(false);
    expect(isCredentialVariable('GIT_CONFIG_KEY_12')).toBe(false);
    expect(isCredentialVariable('GIT_CONFIG_KEY')).toBe(true);
    expect(isCredentialVariable('GIT_CONFIG_VALUE_0')).toBe(false);
  });

  test('the fixed list holds the documented name and the kit judgments, and nothing else', () => {
    expect([...FIXED_CREDENTIAL_NAMES].toSorted()).toEqual([
      'ANTHROPIC_CUSTOM_HEADERS',
      'OTEL_EXPORTER_OTLP_HEADERS',
      'OTEL_EXPORTER_OTLP_LOGS_HEADERS',
      'OTEL_EXPORTER_OTLP_METRICS_HEADERS',
      'OTEL_EXPORTER_OTLP_TRACES_HEADERS',
    ]);
    for (const name of FIXED_CREDENTIAL_NAMES) expect(isCredentialVariable(name)).toBe(true);
  });

  test('ordinary names are not credentials', () => {
    for (const name of [
      'PATH',
      'HOME',
      'LANG',
      'GIT_CONFIG_COUNT',
      'HTTPS_PROXY',
      'PIP_INDEX_URL',
    ]) {
      expect(isCredentialVariable(name)).toBe(false);
    }
  });

  test('withoutCredentials drops exactly the credential names', () => {
    expect(
      withoutCredentials({
        PATH: '/bin',
        ANTHROPIC_API_KEY: 'k',
        gh_token: 't',
        GIT_CONFIG_KEY_0: 'a',
      }),
    ).toEqual({ PATH: '/bin', GIT_CONFIG_KEY_0: 'a' });
  });
});

/** The value shapes the scrub recognises (env-vars.md: "by the shape of its value"). */
describe('the scrub table', () => {
  test('a URL value with a password is credential-shaped; one without is not', () => {
    expect(hasUrlPassword('postgres://app:hunter2@db.internal/app')).toBe(true);
    expect(hasUrlPassword('postgres://app@db.internal/app')).toBe(false);
    expect(hasUrlPassword('postgres://db.internal/app')).toBe(false);
    expect(hasUrlPassword('see https://a:b@x.test and more')).toBe(true);
    expect(hasUrlPassword('mailto:me@example.com')).toBe(false);
    expect(hasUrlPassword('/var/lib/app:cache@home')).toBe(false);
  });

  test('cutting userinfo keeps scheme, host, port and path, once per URL in the value', () => {
    expect(withoutUserinfo('https://u:p@pypi.example.com:8443/simple/')).toBe(
      'https://pypi.example.com:8443/simple/',
    );
    expect(withoutUserinfo('https://tok@r.test/a https://u:p@s.test/b')).toBe(
      'https://r.test/a https://s.test/b',
    );
    expect(withoutUserinfo('https://pypi.org/simple')).toBe('https://pypi.org/simple');
  });

  test('scrubAction: the names the table lists, and the order in which the rules apply', () => {
    expect(scrubAction('ANTHROPIC_API_KEY', 'x')).toBe('remove');
    expect(scrubAction('DB_PASSWORD', 'x')).toBe('remove');
    expect(scrubAction('DATABASE_URL', 'postgres://a:b@h/d')).toBe('remove');
    expect(scrubAction('DATABASE_URL', 'postgres://h/d')).toBe('keep');
    expect(scrubAction('PIP_INDEX_URL', 'https://a:b@h/s')).toBe('cut-userinfo');
    expect(scrubAction('NPM_CONFIG_REGISTRY', 'https://a:b@h/')).toBe('cut-userinfo');
    expect(scrubAction('PIP_INDEX_URL', 'https://h/s')).toBe('keep');
    expect(scrubAction('CLAUDE_CONFIG_DIR', '/home/u/.claude')).toBe('remove');
    expect(scrubAction('GITHUB_TOKEN', 'ghp_x')).toBe('keep');
    expect(scrubAction('HTTPS_PROXY', 'http://u:p@proxy:3128')).toBe('keep');
    expect(scrubAction('GIT_CONFIG_VALUE_0', 'https://u:p@h/')).toBe('keep');
    expect(scrubAction('SOMETHING_ELSE', 'hunter2')).toBe('keep');
  });
});
