/**
 * host-marketplace.md § Write the headersHelper command (text, output, shell and working
 * directory, variables removed and set); § When Claude Code skips a headersHelper command or
 * drops its output ("Command fails"); § Authenticate archive downloads (the output is reused for
 * up to 60 seconds). mcp.md § Which variables a helper can read (the credential rule the docs
 * point to).
 */
import { describe, expect, test } from 'bun:test';
import {
  isCredentialVariable,
  withoutCredentials,
} from '../../src/marketplace/credential-variables.ts';
import { runHeadersHelper } from '../../src/marketplace/header-helper.ts';
import {
  headersOf,
  issueOf,
  layerOfEntry,
  portsWith,
  prints,
  setting,
  signal,
  sourceLayer,
} from '../support/marketplace-headers.ts';
import { spec } from '../support/spec.ts';

const helper = '/opt/bin/mint-registry-token.sh';
const layer = (extra = {}, origin?: Parameters<typeof sourceLayer>[1]) =>
  sourceLayer({ headersHelper: helper, ...extra }, origin);
const run = (replies: Parameters<typeof portsWith>[0], l = layer(), s = setting()) => {
  const fakes = portsWith(replies);
  return { ...fakes, result: runHeadersHelper(l, fakes.ports, s, { signal }) };
};

spec(
  [
    'marketplace.entry.headersHelper',
    'marketplace.sourceField.headersHelper',
    'marketplace.hosting.Write the headersHelper command.Command text',
    'marketplace.hosting.Write the headersHelper command.Output',
    'marketplace.hosting.Write the headersHelper command.Shell and working directory',
    'marketplace.hosting.Write the headersHelper command.Variables Claude Code sets',
    'marketplace.hosting.When Claude Code skips a headersHelper command or drops its output.Command fails',
  ],
  () => {
    test('the command goes through sh -c from the configuration directory, with 10 seconds', async () => {
      const { result, runner } = run([prints({ Authorization: 'Bearer eyJ' })]);
      expect(headersOf(await result)).toEqual({ authorization: 'Bearer eyJ' });
      expect(runner.calls).toHaveLength(1);
      expect(runner.calls[0]).toMatchObject({
        spec: { form: 'exec', command: 'sh', args: ['-c', helper] },
        cwd: '/home/user/.claude',
        timeoutMs: 10_000,
      });
    });

    test('CLAUDE_CONFIG_DIR is the working directory when it is set', async () => {
      const fakes = portsWith([prints({})], { env: { CLAUDE_CONFIG_DIR: '/etc/claude' } });
      await runHeadersHelper(layer(), fakes.ports, setting(), { signal });
      expect(fakes.runner.calls[0]?.cwd).toBe('/etc/claude');
    });

    test('an empty CLAUDE_CONFIG_DIR is unset: the working directory is ~/.claude (judgment)', async () => {
      const fakes = portsWith([prints({})], { env: { CLAUDE_CONFIG_DIR: '' } });
      await runHeadersHelper(layer(), fakes.ports, setting(), { signal });
      expect(fakes.runner.calls[0]?.cwd).toBe('/home/user/.claude');
    });

    test('on Windows the command goes through cmd.exe', async () => {
      const { result, runner } = run([prints({})], layer(), setting({ platform: 'windows' }));
      await result;
      expect(runner.calls[0]?.spec).toEqual({
        form: 'exec',
        command: 'cmd.exe',
        args: ['/c', helper],
      });
    });

    test('a non-zero exit, a timeout and a command that did not start each refuse the fetch with an issue', async () => {
      const replies = [
        { exitCode: 3 },
        { exitCode: null, timedOut: true },
        { exitCode: null, startError: 'no sh' },
      ];
      for (const reply of replies) {
        const found = issueOf(await run([reply]).result);
        expect(found.severity).toBe('error');
        expect(found.path).toBe('headersHelper');
      }
    });

    test('a header named like an issue field is still a header, not a refusal', async () => {
      const printed = { severity: 'high', path: '/p', message: 'm' };
      expect(headersOf(await run([prints(printed)]).result)).toEqual(printed);
    });

    test('output that is not a JSON object of string values refuses the fetch', async () => {
      for (const stdout of [
        '',
        'not json',
        '[]',
        'null',
        '"x"',
        '{"A":1}',
        '{"A":{"b":"c"}}',
        '{"A":null}',
      ]) {
        expect(issueOf(await run([{ stdout }]).result).severity).toBe('error');
      }
    });

    test('command text: more than 500 characters, non-ASCII or four spaces in a row is refused before it runs', async () => {
      for (const command of ['x'.repeat(501), 'tokén', 'a    b', 'a\tb']) {
        const fakes = portsWith([]);
        const found = issueOf(
          await runHeadersHelper(layer({ headersHelper: command }), fakes.ports, setting(), {
            signal,
          }),
        );
        expect(found.severity).toBe('error');
        expect(fakes.runner.calls).toEqual([]);
      }
      const limit = portsWith([prints({})]);
      const accepted = await runHeadersHelper(
        layer({ headersHelper: 'x'.repeat(500) }),
        limit.ports,
        setting(),
        { signal },
      );
      expect(headersOf(accepted)).toEqual({});
    });

    test('a url source command gets CLAUDE_CODE_MARKETPLACE_URL and _NAME; the name is unset on the first fetch', async () => {
      const named = run([prints({})]);
      await named.result;
      expect(named.runner.calls[0]?.env).toMatchObject({
        CLAUDE_CODE_MARKETPLACE_URL: 'https://plugins.example.com/marketplace.json',
        CLAUDE_CODE_MARKETPLACE_NAME: 'acme',
      });
      const first = run([prints({})], sourceLayer({ headersHelper: helper, name: undefined }));
      await first.result;
      expect(first.runner.calls[0]?.env).not.toHaveProperty('CLAUDE_CODE_MARKETPLACE_NAME');
      expect(first.runner.calls[0]?.env).toHaveProperty('CLAUDE_CODE_MARKETPLACE_URL');
    });

    test('an entry command gets CLAUDE_CODE_PLUGIN_NAME and CLAUDE_CODE_PLUGIN_ARCHIVE_URL', async () => {
      const { result, runner } = run([prints({})], layerOfEntry({ headersHelper: helper }));
      await result;
      expect(runner.calls[0]?.env).toMatchObject({
        CLAUDE_CODE_PLUGIN_NAME: 'formatter',
        CLAUDE_CODE_PLUGIN_ARCHIVE_URL: 'https://plugins.example.com/p/formatter-2.0.0.zip',
      });
      expect(runner.calls[0]?.env).not.toHaveProperty('CLAUDE_CODE_MARKETPLACE_URL');
    });

    test('a command set in a catalog entry or in project settings runs without credential variables', async () => {
      const env = { PATH: '/bin', ANTHROPIC_API_KEY: 'k', MY_REGISTRY_TOKEN: 't' };
      for (const l of [layerOfEntry({ headersHelper: helper }), layer({}, 'project')]) {
        const fakes = portsWith([prints({})], { env });
        await runHeadersHelper(l, fakes.ports, setting({ folderTrusted: true }), { signal });
        expect(fakes.runner.calls[0]?.env).toEqual(expect.objectContaining({ PATH: '/bin' }));
        expect(fakes.runner.calls[0]?.env).not.toHaveProperty('ANTHROPIC_API_KEY');
        expect(fakes.runner.calls[0]?.env).not.toHaveProperty('MY_REGISTRY_TOKEN');
      }
    });

    test('user settings, a --settings file and managed settings keep the environment whole', async () => {
      const env = { PATH: '/bin', ANTHROPIC_API_KEY: 'k', MY_REGISTRY_TOKEN: 't' };
      for (const origin of ['user', 'cli-settings', 'managed', 'server-managed'] as const) {
        const fakes = portsWith([prints({})], { env });
        await runHeadersHelper(layer({}, origin), fakes.ports, setting(), { signal });
        expect(fakes.runner.calls[0]?.env).toMatchObject(env);
      }
    });
  },
);

describe('which variables look like a credential (mcp.md, "Which variables a helper can read")', () => {
  spec(
    [
      'marketplace.entry.headersHelper',
      'marketplace.sourceField.headersHelper',
      'marketplace.hosting.Write the headersHelper command.Variables Claude Code removes',
    ],
    () => {
      test('a name with TOKEN, SECRET, PASSWORD, KEY or AUTH in it, in either letter case, is removed', () => {
        for (const name of [
          'ANTHROPIC_API_KEY',
          'MY_REGISTRY_TOKEN',
          'db_password',
          'Client_Secret',
          'AWS_AUTH_FILE',
        ]) {
          expect(isCredentialVariable(name)).toBe(true);
        }
        expect(
          withoutCredentials({ PATH: '/bin', HOME: '/h', ANTHROPIC_API_KEY: 'k', gh_token: 't' }),
        ).toEqual({
          PATH: '/bin',
          HOME: '/h',
        });
      });

      test('Git GIT_CONFIG_KEY_<n> variables are the exception and stay', () => {
        expect(isCredentialVariable('GIT_CONFIG_KEY_0')).toBe(false);
        expect(isCredentialVariable('GIT_CONFIG_KEY_12')).toBe(false);
        expect(isCredentialVariable('GIT_CONFIG_KEY')).toBe(true);
      });

      test('ANTHROPIC_CUSTOM_HEADERS, a credential whose name has no such word, is removed too', () => {
        expect(isCredentialVariable('ANTHROPIC_CUSTOM_HEADERS')).toBe(true);
      });

      test('an ordinary variable stays', () => {
        for (const name of ['PATH', 'HOME', 'GIT_CONFIG_COUNT', 'LANG']) {
          expect(isCredentialVariable(name)).toBe(false);
        }
      });
    },
  );
});

const twice = async (gap: number) => {
  const fakes = portsWith([
    prints({ Authorization: 'Bearer 1' }),
    prints({ Authorization: 'Bearer 2' }),
  ]);
  const key = layer();
  const first = await fakes.ports.cache.remember(key, () =>
    runHeadersHelper(key, fakes.ports, setting(), { signal }),
  );
  fakes.clock.advance(gap);
  const second = await fakes.ports.cache.remember(key, () =>
    runHeadersHelper(key, fakes.ports, setting(), { signal }),
  );
  return { first, second, runs: fakes.runner.calls.length };
};

spec('marketplace.sourceField.headersHelper', () => {
  test('one run of a url source command is reused for up to 60 seconds', async () => {
    const { first, second, runs } = await twice(59_000);
    expect(runs).toBe(1);
    expect(headersOf(second)).toEqual(headersOf(first));
  });

  test('after 60 seconds the command runs again', async () => {
    const { second, runs } = await twice(61_000);
    expect(runs).toBe(2);
    expect(headersOf(second)).toEqual({ authorization: 'Bearer 2' });
  });

  test('concurrent downloads on one origin share the run in flight (judgment)', async () => {
    const fakes = portsWith([prints({ A: 'b' })]);
    const key = layer();
    const remember = () =>
      fakes.ports.cache.remember(key, () =>
        runHeadersHelper(key, fakes.ports, setting(), { signal }),
      );
    const [first, second] = await Promise.all([remember(), remember()]);
    expect(fakes.runner.calls).toHaveLength(1);
    expect(headersOf(second)).toEqual(headersOf(first));
  });

  test('a failed run is not reused', async () => {
    const fakes = portsWith([{ exitCode: 1 }, prints({ A: 'b' })]);
    const key = layer();
    const run1 = () =>
      fakes.ports.cache.remember(key, () =>
        runHeadersHelper(key, fakes.ports, setting(), { signal }),
      );
    expect(issueOf(await run1()).severity).toBe('error');
    expect(headersOf(await run1())).toEqual({ a: 'b' });
  });

  test('another command, or another marketplace URL, is another run', async () => {
    const fakes = portsWith([prints({ A: '1' }), prints({ A: '2' })]);
    const a = layer();
    const b = layer({ url: 'https://other.example.com/marketplace.json' });
    for (const l of [a, b]) {
      await fakes.ports.cache.remember(l, () =>
        runHeadersHelper(l, fakes.ports, setting(), { signal }),
      );
    }
    expect(fakes.runner.calls).toHaveLength(2);
  });

  test('an entry command is never reused: it runs on each install or update', async () => {
    const fakes = portsWith([prints({ A: '1' }), prints({ A: '2' })]);
    const entry = layerOfEntry({ headersHelper: helper });
    for (let i = 0; i < 2; i += 1) {
      await fakes.ports.cache.remember(entry, () =>
        runHeadersHelper(entry, fakes.ports, setting(), { signal }),
      );
    }
    expect(fakes.runner.calls).toHaveLength(2);
  });
});
