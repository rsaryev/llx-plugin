/**
 * env-vars.md § What the subprocess environment scrub removes, around the table: what a hook process
 * gets, and what "looks like a credential" means. The docs give examples only; the rows below are
 * oracle 2.1.321 (spec/judgments.md, `src/format/credential-env.ts`): a SessionStart hook printed its
 * environment under `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` with each variable of
 * tests/fixtures/subprocess-scrub set (`bun run oracle:subprocess-scrub`). Asserted outside
 * `spec(...)`: an oracle row is never docs proof.
 */
import { describe, expect, test } from 'bun:test';
import { runHandler } from '../../../../src/hooks/handlers/index.ts';
import { pluginCommand, runContext, settingsCommand } from '../../../support/hooks-run.ts';
import { fakeEnvironment, scriptedRunner } from '../../../support/ports.ts';
import {
  readScrubCandidates,
  readScrubExpected,
} from '../../../../scripts/oracle/subprocess-scrub.ts';

const candidates = await readScrubCandidates();
const { left } = await readScrubExpected();

const SCRUB = { CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1' } as const;

/** The environment a hook process gets from a host environment of these variables, scrub on. */
async function scrubbed(variables: Record<string, string>) {
  const runner = scriptedRunner({});
  await runHandler(
    settingsCommand({ command: './h.sh' }),
    runContext({ runner, environment: fakeEnvironment({ ...SCRUB, ...variables }) }),
  );
  const { CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: _switch, ...rest } = runner.calls[0]?.env ?? {};
  return rest;
}

describe('the scrub of a hook process (oracle 2.1.321)', () => {
  test('"A secret whose variable name and value don\'t look like a credential" stays', async () => {
    expect(await scrubbed({ BUILD_NOTE: 'the vault code is 4411' })).toMatchObject({
      BUILD_NOTE: 'the vault code is 4411',
    });
  });

  test('every probed variable is left as claude left it', async () => {
    const env = await scrubbed(
      Object.fromEntries(candidates.map(({ name, value }) => [name, value])),
    );
    const got = Object.fromEntries(candidates.map(({ name }) => [name, env[name] ?? null]));
    expect(got).toEqual(left);
  });

  test('the switch reads `true` as `1`', async () => {
    const runner = scriptedRunner({});
    await runHandler(
      settingsCommand({ command: './h.sh' }),
      runContext({
        runner,
        environment: fakeEnvironment({ CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: 'true', MY_AUTH: 'x' }),
      }),
    );
    expect(runner.calls[0]?.env).not.toHaveProperty('MY_AUTH');
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
