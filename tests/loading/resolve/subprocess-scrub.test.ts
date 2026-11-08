/**
 * env-vars.md § What the subprocess environment scrub removes (the table, "Before v2.1.251", the
 * Linux PID-namespace note, which stays a host duty) and the `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB`
 * row of § Variables ("Set to `1` to strip credentials from the environments of the subprocesses
 * Claude Code starts"; the on/off spellings of the page's note). Examples are the table's own.
 */
import { describe, expect, test } from 'bun:test';
import { scrubEnvironment, subprocessScrubEnabled } from '../../../src/index.ts';
import { spec } from '../../support/spec.ts';

const ON = { CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1' };
const options = { version: '2.1.319' };

const scrub = (variables: Record<string, string>): Record<string, string> =>
  scrubEnvironment({ ...ON, PATH: '/bin', ...variables }, options);

const removed = (name: string, value = 'secret-value'): void => {
  const out = scrub({ [name]: value });
  expect(Object.hasOwn(out, name)).toBe(false);
  expect(out.PATH).toBe('/bin');
};

const kept = (name: string, value: string): void => {
  expect(scrub({ [name]: value })[name]).toBe(value);
};

const old = (variables: Record<string, string>): Record<string, string> =>
  scrubEnvironment({ ...ON, ...variables }, { version: '2.1.250' });

const PREFIX = 'environment.host.What the subprocess environment scrub removes';

spec('environment.host.CLAUDE_CODE_SUBPROCESS_ENV_SCRUB', () => {
  test('set to 1 it strips credentials; unset it leaves the environment as it was', () => {
    const snapshot = { PATH: '/bin', ANTHROPIC_API_KEY: 'k', MY_REGISTRY_TOKEN: 't' };
    expect(scrubEnvironment({ ...snapshot, ...ON }, options)).toEqual({ ...ON, PATH: '/bin' });
    expect(scrubEnvironment(snapshot, options)).toEqual(snapshot);
  });

  test("the page's on/off spellings: 1, true, yes, on in any casing turn it on; 0, false, no, off, empty do not", () => {
    for (const on of ['1', 'true', 'TRUE', 'Yes', 'on', 'ON']) {
      expect(subprocessScrubEnabled({ CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: on })).toBe(true);
    }
    for (const off of ['0', 'false', 'No', 'off', '']) {
      expect(subprocessScrubEnabled({ CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: off })).toBe(false);
    }
    expect(subprocessScrubEnabled({})).toBe(false);
  });

  test('the Claude Code process keeps its own environment: the snapshot is not changed', () => {
    const snapshot = Object.freeze({ ...ON, ANTHROPIC_API_KEY: 'k' });
    scrubEnvironment(snapshot, options);
    expect(snapshot.ANTHROPIC_API_KEY).toBe('k');
  });
});

spec(`${PREFIX}.ANTHROPIC_API_KEY`, () => {
  test('ANTHROPIC_API_KEY is removed', () => removed('ANTHROPIC_API_KEY'));
});
spec(`${PREFIX}.AWS_SECRET_ACCESS_KEY`, () => {
  test('AWS_SECRET_ACCESS_KEY is removed', () => removed('AWS_SECRET_ACCESS_KEY'));
});
spec(`${PREFIX}.NPM_TOKEN`, () => {
  test('NPM_TOKEN is removed because its name looks like a credential', () => removed('NPM_TOKEN'));
  test('so is any other name with TOKEN, SECRET, PASSWORD, KEY or AUTH, in either case', () => {
    for (const name of ['MY_REGISTRY_TOKEN', 'client_secret', 'SSH_AUTH_SOCK', 'Stripe_Key']) {
      removed(name);
    }
  });
});
spec(`${PREFIX}.DB_PASSWORD`, () => {
  test('DB_PASSWORD is removed because its name looks like a credential', () =>
    removed('DB_PASSWORD'));
});
spec(`${PREFIX}.DATABASE_URL`, () => {
  test('a DATABASE_URL that contains a password is removed because its value looks like a credential', () =>
    removed('DATABASE_URL', 'postgres://app:hunter2@db.internal:5432/app'));

  test('a DATABASE_URL without a password stays', () => {
    kept('DATABASE_URL', 'postgres://db.internal:5432/app');
    kept('DATABASE_URL', 'postgres://app@db.internal:5432/app');
  });

  test('a secret whose name and value do not look like a credential stays', () => {
    kept('MY_PIN', 'hunter2');
    kept('SESSION_SIGNING_VALUE', 'c2VjcmV0');
  });
});
spec(`${PREFIX}.PIP_INDEX_URL`, () => {
  test('a PIP_INDEX_URL with a password keeps the URL and loses the username and password', () => {
    expect(
      scrub({ PIP_INDEX_URL: 'https://bob:hunter2@pypi.example.com/simple/' }).PIP_INDEX_URL,
    ).toBe('https://pypi.example.com/simple/');
  });

  test('NPM_CONFIG_REGISTRY gets the same treatment, and a URL without userinfo is untouched', () => {
    expect(
      scrub({ NPM_CONFIG_REGISTRY: 'https://bob:pw@npm.example.com:4873/' }).NPM_CONFIG_REGISTRY,
    ).toBe('https://npm.example.com:4873/');
    kept('PIP_INDEX_URL', 'https://pypi.org/simple');
  });
});
spec(`${PREFIX}.CLAUDE_CONFIG_DIR`, () => {
  test('CLAUDE_CONFIG_DIR is removed', () => removed('CLAUDE_CONFIG_DIR', '/home/u/.claude'));
});
spec(`${PREFIX}.GITHUB_TOKEN`, () => {
  test('GITHUB_TOKEN stays, so gh and GitHub API scripts keep working, though its name looks like a credential', () =>
    kept('GITHUB_TOKEN', 'ghp_example'));
});
spec(`${PREFIX}.GH_TOKEN`, () => {
  test('GH_TOKEN stays', () => kept('GH_TOKEN', 'ghp_example'));
});
spec(`${PREFIX}.GH_ENTERPRISE_TOKEN`, () => {
  test('GH_ENTERPRISE_TOKEN stays', () => kept('GH_ENTERPRISE_TOKEN', 'ghe_example'));
});
spec(`${PREFIX}.GITHUB_ENTERPRISE_TOKEN`, () => {
  test('GITHUB_ENTERPRISE_TOKEN stays', () => kept('GITHUB_ENTERPRISE_TOKEN', 'ghe_example'));
});
spec(`${PREFIX}.HTTP_PROXY`, () => {
  test('HTTP_PROXY stays, a username and password in the URL included', () =>
    kept('HTTP_PROXY', 'http://user:pass@proxy.corp:3128'));
});
spec(`${PREFIX}.HTTPS_PROXY`, () => {
  test('HTTPS_PROXY stays, a username and password in the URL included', () =>
    kept('HTTPS_PROXY', 'http://user:pass@proxy.corp:3128'));
});
spec(`${PREFIX}.GIT_CONFIG_COUNT`, () => {
  test('GIT_CONFIG_COUNT stays', () => kept('GIT_CONFIG_COUNT', '2'));
});
spec(`${PREFIX}.GIT_CONFIG_KEY_<n>`, () => {
  test('GIT_CONFIG_KEY_<n> stays whatever it holds, though its name has KEY in it', () => {
    kept('GIT_CONFIG_KEY_0', 'http.extraheader');
    kept('GIT_CONFIG_KEY_12', 'url.https://x:pw@h/.insteadOf');
  });
});
spec(`${PREFIX}.GIT_CONFIG_VALUE_<n>`, () => {
  test('GIT_CONFIG_VALUE_<n> stays whatever it holds, a URL with a password included', () => {
    kept('GIT_CONFIG_VALUE_0', 'AUTHORIZATION: bearer abc');
    kept('GIT_CONFIG_VALUE_3', 'https://user:pw@git.example.com/');
  });
});

describe("before v2.1.251 (env-vars.md: the scrub removed two variables and left the table's other examples)", () => {
  test('2.1.250 removes ANTHROPIC_API_KEY and AWS_SECRET_ACCESS_KEY and nothing else', () => {
    const all = {
      ANTHROPIC_API_KEY: 'k',
      AWS_SECRET_ACCESS_KEY: 's',
      NPM_TOKEN: 't',
      DB_PASSWORD: 'p',
      DATABASE_URL: 'postgres://a:b@h/d',
      PIP_INDEX_URL: 'https://a:b@h/s',
      CLAUDE_CONFIG_DIR: '/c',
      GITHUB_TOKEN: 'g',
    };
    expect(old(all)).toEqual({
      ...ON,
      NPM_TOKEN: 't',
      DB_PASSWORD: 'p',
      DATABASE_URL: 'postgres://a:b@h/d',
      PIP_INDEX_URL: 'https://a:b@h/s',
      CLAUDE_CONFIG_DIR: '/c',
      GITHUB_TOKEN: 'g',
    });
  });

  test('2.1.251 and later run the whole table; a version the kit cannot read is the current table (judgment)', () => {
    for (const version of ['2.1.251', '2.2.0', '3.0.0', 'latest', '']) {
      const out = scrubEnvironment({ ...ON, NPM_TOKEN: 't', GITHUB_TOKEN: 'g' }, { version });
      expect(out).toEqual({ ...ON, GITHUB_TOKEN: 'g' });
    }
  });
});
