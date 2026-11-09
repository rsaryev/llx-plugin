/**
 * env-vars.md § `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` (the variables table) and § What the subprocess
 * environment scrub removes: with the variable set to `1`, a command hook's environment has its
 * credentials removed, each example variable of the docs' table treated as the table says. The
 * names and value shapes the docs call "looks like a credential" are judgments
 * (spec/judgments.md); they are tested outside `spec(...)`.
 */
import { expect, test } from 'bun:test';
import { runHandler } from '../../../../src/hooks/handlers/index.ts';
import { runContext, settingsCommand } from '../../../support/hooks-run.ts';
import { fakeEnvironment, scriptedRunner } from '../../../support/ports.ts';
import { spec } from '../../../support/spec.ts';

const SCRUB = { CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1' } as const;

/** The environment a hook process gets from a host environment of these variables. */
async function hookEnv(
  variables: Record<string, string>,
  context: Partial<Parameters<typeof runContext>[0]> = {},
) {
  const runner = scriptedRunner({});
  await runHandler(
    settingsCommand({ command: './h.sh' }),
    runContext({ runner, environment: fakeEnvironment(variables), ...context }),
  );
  return runner.calls[0]?.env ?? {};
}

const scrubbed = (variables: Record<string, string>) => hookEnv({ ...SCRUB, ...variables });

spec('environment.host.CLAUDE_CODE_SUBPROCESS_ENV_SCRUB', () => {
  test('set to 1, the credentials of the host environment never reach a hook', async () => {
    const env = await hookEnv({
      ...SCRUB,
      ANTHROPIC_API_KEY: 'sk-ant-secret',
      PATH: '/usr/bin',
      LANG: 'en_US.UTF-8',
    });
    expect(env).not.toHaveProperty('ANTHROPIC_API_KEY');
    expect(env['PATH']).toBe('/usr/bin');
    expect(env['LANG']).toBe('en_US.UTF-8');
  });

  test('unset, or an off spelling, leaves the environment alone; `true` turns it on as `1` does', async () => {
    // env-vars.md: "set `1`, `true`, `yes`, or `on` to turn it on and `0`, `false`, `no`, or `off` to turn it off".
    expect(
      (await hookEnv({ ANTHROPIC_API_KEY: 'k', CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: 'true' }))[
        'ANTHROPIC_API_KEY'
      ],
    ).toBeUndefined();
    for (const value of [undefined, '0', '', 'false', 'off']) {
      const env = await hookEnv({
        ANTHROPIC_API_KEY: 'sk-ant-secret',
        ...(value === undefined ? {} : { CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: value }),
      });
      expect(env['ANTHROPIC_API_KEY']).toBe('sk-ant-secret');
    }
  });

  test('the setting can come from a settings file env block', async () => {
    const env = await hookEnv(
      { NPM_TOKEN: 'npm_secret' },
      { settingsEnv: { CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1' } },
    );
    expect(env).not.toHaveProperty('NPM_TOKEN');
  });

  test('a credential a settings file env block sets is scrubbed too: it is in the process environment', async () => {
    const env = await hookEnv(SCRUB, {
      settingsEnv: { DB_PASSWORD: 'hunter2', KEEP: '1' },
    });
    expect(env).not.toHaveProperty('DB_PASSWORD');
    expect(env['KEEP']).toBe('1');
  });

  test('the scrub is applied to every hook the same way: exec form as well as shell form', async () => {
    const runner = scriptedRunner({});
    await runHandler(
      settingsCommand({ command: 'tool', args: [] }),
      runContext({
        runner,
        environment: fakeEnvironment({ ...SCRUB, AWS_SECRET_ACCESS_KEY: 'x' }),
      }),
    );
    expect(runner.calls[0]?.env).not.toHaveProperty('AWS_SECRET_ACCESS_KEY');
  });

  test('the Windows host compares the names it removes without regard to case', async () => {
    const env = await hookEnv(
      { ...SCRUB, Claude_Config_Dir: 'C:\\x', Github_Token: 'ghp_x' },
      { windows: true },
    );
    expect(env).not.toHaveProperty('Claude_Config_Dir');
    expect(env['Github_Token']).toBe('ghp_x');
  });
});

spec('environment.host.What the subprocess environment scrub removes.ANTHROPIC_API_KEY', () => {
  test('removes it', async () => {
    expect(await scrubbed({ ANTHROPIC_API_KEY: 'sk-ant-x' })).not.toHaveProperty(
      'ANTHROPIC_API_KEY',
    );
  });
});

spec('environment.host.What the subprocess environment scrub removes.AWS_SECRET_ACCESS_KEY', () => {
  test('removes it', async () => {
    expect(await scrubbed({ AWS_SECRET_ACCESS_KEY: 'x', AWS_REGION: 'eu-west-1' })).toMatchObject({
      AWS_REGION: 'eu-west-1',
    });
    expect(await scrubbed({ AWS_SECRET_ACCESS_KEY: 'x' })).not.toHaveProperty(
      'AWS_SECRET_ACCESS_KEY',
    );
  });
});

spec('environment.host.What the subprocess environment scrub removes.NPM_TOKEN', () => {
  test('removes it, because the name looks like a credential', async () => {
    expect(await scrubbed({ NPM_TOKEN: 'npm_x' })).not.toHaveProperty('NPM_TOKEN');
  });

  test('any variable whose name looks like a credential goes the same way', async () => {
    const env = await scrubbed({
      SLACK_BOT_TOKEN: 'x',
      STRIPE_SECRET: 'x',
      SERVICE_PASSWORD: 'x',
    });
    expect(Object.keys(env).filter((name) => /TOKEN|SECRET|PASSWORD/.test(name))).toEqual([]);
  });
});

spec('environment.host.What the subprocess environment scrub removes.DB_PASSWORD', () => {
  test('removes it, because the name looks like a credential', async () => {
    expect(await scrubbed({ DB_PASSWORD: 'hunter2' })).not.toHaveProperty('DB_PASSWORD');
  });
});

spec('environment.host.What the subprocess environment scrub removes.DATABASE_URL', () => {
  test('removes it when it contains a password: the value looks like a credential', async () => {
    expect(
      await scrubbed({
        DATABASE_URL: 'postgres://app:hunter2@db.internal:5432/app',
      }),
    ).not.toHaveProperty('DATABASE_URL');
  });

  test('keeps it when it holds no password', async () => {
    expect(await scrubbed({ DATABASE_URL: 'postgres://db.internal:5432/app' })).toMatchObject({
      DATABASE_URL: 'postgres://db.internal:5432/app',
    });
  });
});

spec('environment.host.What the subprocess environment scrub removes.PIP_INDEX_URL', () => {
  test('keeps the URL and cuts the username and password from it, for PIP_INDEX_URL and NPM_CONFIG_REGISTRY', async () => {
    const env = await scrubbed({
      PIP_INDEX_URL: 'https://user:s3cret@pypi.example.com/simple',
      NPM_CONFIG_REGISTRY: 'https://bot:s3cret@registry.example.com/npm/',
    });
    expect(env['PIP_INDEX_URL']).toBe('https://pypi.example.com/simple');
    expect(env['NPM_CONFIG_REGISTRY']).toBe('https://registry.example.com/npm/');
  });

  test('leaves a URL with no password as it is', async () => {
    expect(await scrubbed({ PIP_INDEX_URL: 'https://pypi.example.com/simple' })).toMatchObject({
      PIP_INDEX_URL: 'https://pypi.example.com/simple',
    });
  });
});

spec('environment.host.What the subprocess environment scrub removes.CLAUDE_CONFIG_DIR', () => {
  test('removes it', async () => {
    expect(await scrubbed({ CLAUDE_CONFIG_DIR: '/home/you/.claude-work' })).not.toHaveProperty(
      'CLAUDE_CONFIG_DIR',
    );
  });
});

spec('environment.host.What the subprocess environment scrub removes.GITHUB_TOKEN', () => {
  test('leaves GITHUB_TOKEN in place, so that gh and scripts that call the GitHub API keep working', async () => {
    expect(await scrubbed({ GITHUB_TOKEN: 'ghp_x' })).toMatchObject({
      GITHUB_TOKEN: 'ghp_x',
    });
  });
});

spec('environment.host.What the subprocess environment scrub removes.GH_TOKEN', () => {
  test('leaves GH_TOKEN in place, so that gh and scripts that call the GitHub API keep working', async () => {
    expect(await scrubbed({ GH_TOKEN: 'ghp_x' })).toMatchObject({
      GH_TOKEN: 'ghp_x',
    });
  });
});

spec('environment.host.What the subprocess environment scrub removes.GH_ENTERPRISE_TOKEN', () => {
  test('leaves GH_ENTERPRISE_TOKEN in place, so that gh and scripts that call the GitHub API keep working', async () => {
    expect(await scrubbed({ GH_ENTERPRISE_TOKEN: 'ghp_x' })).toMatchObject({
      GH_ENTERPRISE_TOKEN: 'ghp_x',
    });
  });
});

spec(
  'environment.host.What the subprocess environment scrub removes.GITHUB_ENTERPRISE_TOKEN',
  () => {
    test('leaves GITHUB_ENTERPRISE_TOKEN in place, so that gh and scripts that call the GitHub API keep working', async () => {
      expect(await scrubbed({ GITHUB_ENTERPRISE_TOKEN: 'ghp_x' })).toMatchObject({
        GITHUB_ENTERPRISE_TOKEN: 'ghp_x',
      });
    });
  },
);

spec('environment.host.What the subprocess environment scrub removes.HTTP_PROXY', () => {
  test('leaves it in place, including a username and password in the URL', async () => {
    expect(await scrubbed({ HTTP_PROXY: 'http://user:pw@proxy.corp:3128' })).toMatchObject({
      HTTP_PROXY: 'http://user:pw@proxy.corp:3128',
    });
  });
});

spec('environment.host.What the subprocess environment scrub removes.HTTPS_PROXY', () => {
  test('leaves it in place, including a username and password in the URL', async () => {
    expect(await scrubbed({ HTTPS_PROXY: 'http://user:pw@proxy.corp:3128' })).toMatchObject({
      HTTPS_PROXY: 'http://user:pw@proxy.corp:3128',
    });
  });
});

spec('environment.host.What the subprocess environment scrub removes.GIT_CONFIG_COUNT', () => {
  test('leaves it in place, whatever it holds', async () => {
    expect(await scrubbed({ GIT_CONFIG_COUNT: '2' })).toMatchObject({
      GIT_CONFIG_COUNT: '2',
    });
  });
});

spec('environment.host.What the subprocess environment scrub removes.GIT_CONFIG_KEY_<n>', () => {
  test('leaves GIT_CONFIG_KEY_0, GIT_CONFIG_KEY_1 and the like in place, whatever they hold', async () => {
    const env = await scrubbed({
      GIT_CONFIG_KEY_0: 'http.extraHeader',
      GIT_CONFIG_KEY_1: 'credential.helper',
    });
    expect(env).toMatchObject({
      GIT_CONFIG_KEY_0: 'http.extraHeader',
      GIT_CONFIG_KEY_1: 'credential.helper',
    });
  });
});

spec('environment.host.What the subprocess environment scrub removes.GIT_CONFIG_VALUE_<n>', () => {
  test('leaves GIT_CONFIG_VALUE_0 in place, even a value that looks like a credential', async () => {
    const env = await scrubbed({
      GIT_CONFIG_VALUE_0: 'Authorization: bearer abc',
      GIT_CONFIG_VALUE_1: 'https://u:pw@git.example.com',
    });
    expect(env).toMatchObject({
      GIT_CONFIG_VALUE_0: 'Authorization: bearer abc',
      GIT_CONFIG_VALUE_1: 'https://u:pw@git.example.com',
    });
  });
});
