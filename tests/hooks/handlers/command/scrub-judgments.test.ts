/**
 * env-vars.md § What the subprocess environment scrub removes: what the docs leave in place around the
 * table, and the judgments (spec/judgments.md, `scrub.ts`) for what "looks like a credential" means
 * and for the names the docs do not list. Asserted outside `spec(...)`: a judgment is never proof.
 */
import { describe, expect, test } from 'bun:test';
import { runHandler } from '../../../../src/hooks/handlers/index.ts';
import { scrubEnvironment } from '../../../../src/hooks/handlers/command/scrub.ts';
import { pluginCommand, runContext, settingsCommand } from '../../../support/hooks-run.ts';
import { fakeEnvironment, scriptedRunner } from '../../../support/ports.ts';

const SCRUB = { CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1' } as const;

/** The environment a hook process gets from a host environment of these variables, scrub on. */
async function scrubbed(variables: Record<string, string>) {
  const runner = scriptedRunner({});
  await runHandler(
    settingsCommand({ command: './h.sh' }),
    runContext({ runner, environment: fakeEnvironment({ ...SCRUB, ...variables }) }),
  );
  return runner.calls[0]?.env ?? {};
}

const scrubbedPure = (variables: Record<string, string>) => scrubEnvironment(variables, false);

describe('what the docs leave in place, and the judgments around the table', () => {
  test('"A secret whose variable name and value don\'t look like a credential" stays', async () => {
    expect(await scrubbed({ BUILD_NOTE: 'the vault code is 4411' })).toMatchObject({
      BUILD_NOTE: 'the vault code is 4411',
    });
  });

  test('names that only contain a credential word as part of a longer word stay', () => {
    const env = scrubbedPure({
      TOKENIZERS_PARALLELISM: 'false',
      PWD: '/work',
      SSH_AUTH_SOCK: '/s',
    });
    expect(env).toEqual({
      TOKENIZERS_PARALLELISM: 'false',
      PWD: '/work',
      SSH_AUTH_SOCK: '/s',
    });
  });

  test('judgment: a PEM private key value is a credential by its shape', () => {
    const env = scrubbedPure({
      DEPLOY_KEY_DATA: '-----BEGIN OPENSSH PRIVATE KEY-----\nabc',
    });
    expect(env).toEqual({});
  });

  test('judgment: the proxy variables stay in lower case too, as network-config.md says they work', () => {
    const proxy = 'http://user:pw@proxy.corp:3128';
    const env = scrubbedPure({
      https_proxy: proxy,
      http_proxy: proxy,
      Https_Proxy: proxy,
    });
    expect(env).toEqual({
      https_proxy: proxy,
      http_proxy: proxy,
      Https_Proxy: proxy,
    });
  });

  test('judgment: a name is a credential in the spelling without an underscore too', () => {
    expect(
      scrubbedPure({
        APIKEY: 'x',
        PRIVATEKEY: 'x',
        ACCESSKEY: 'x',
        MY_APIKEY_V2: 'x',
      }),
    ).toEqual({});
    expect(
      scrubbedPure({
        API_KEY: 'x',
        PRIVATE_KEY: 'x',
        ACCESS_KEY: 'x',
        KEY: 'x',
        MONKEY: 'x',
      }),
    ).toEqual({ KEY: 'x', MONKEY: 'x' });
  });

  test('judgment: a credential name is matched without regard to case on every host', () => {
    expect(
      scrubbedPure({
        service_password: 'x',
        Db_Token: 'x',
        api_key: 'x',
        Home: '/h',
      }),
    ).toEqual({
      Home: '/h',
    });
  });

  test('judgment: an index URL name is INDEX_URL or REGISTRY alone or after an underscore, in any case', () => {
    const url = 'https://u:pw@host.example.com/simple';
    expect(
      scrubbedPure({
        INDEX_URL: url,
        npm_config_registry: url,
        EXTRA_INDEX_URL: url,
        PIP_INDEX_URL: url,
      }),
    ).toEqual({
      INDEX_URL: 'https://host.example.com/simple',
      npm_config_registry: 'https://host.example.com/simple',
      EXTRA_INDEX_URL: 'https://host.example.com/simple',
      PIP_INDEX_URL: 'https://host.example.com/simple',
    });
  });

  test('judgment: a name that only ends in those words without an underscore is not an index URL, so its password URL is removed by shape', () => {
    const url = 'https://u:pw@host.example.com/simple';
    expect(scrubbedPure({ MYREGISTRY: url, NOINDEX_URL: url })).toEqual({});
  });

  test('judgment: a variable the kit exports to the hook (a plugin option) is never scrubbed', async () => {
    const runner = scriptedRunner({});
    await runHandler(
      pluginCommand({ command: './h.sh' }),
      runContext({
        runner,
        environment: fakeEnvironment(SCRUB),
        userConfigOf: () => ({
          declared: {
            api_token: { type: 'string', title: 't', description: 'd' },
          },
          values: { api_token: 'plugin-owned' },
        }),
      }),
    );
    expect(runner.calls[0]?.env['CLAUDE_PLUGIN_OPTION_API_TOKEN']).toBe('plugin-owned');
  });
});
