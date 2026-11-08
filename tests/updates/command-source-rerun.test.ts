/**
 * plugins/loading.md § When a command source re-runs (every install and update; once per session
 * in the background; at startup or on `/reload-plugins` when an enabled plugin's installed version is
 * missing from the cache; the two background runs skipped by `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`;
 * a changed hash installs a new version and reloads it, or asks for `/reload-plugins` when reloading
 * would invalidate the prompt cache) and plugins/host-marketplace.md § Change the command of a
 * command source (a changed command or a switched `mode` must be accepted again: no more background
 * runs, an Errors-tab entry with the new command and the `claude plugin update` command to run).
 * What the docs leave open (the wording of the notices, a plugin that is disabled, a changed command
 * at the same time as the traffic variable) is outside `spec(...)` and in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import {
  afterCommandRun,
  commandSourceRuns,
  type CommandPlugin,
  type RerunEvent,
} from '../../src/updates/command-source-rerun.ts';
import { fakeEnvironment } from '../support/ports.ts';
import { spec } from '../support/spec.ts';

const COMMAND = 'my-tool print-plugin --target ./out';

const plugin = (extra: Partial<CommandPlugin> = {}): CommandPlugin => ({
  id: 'tool@acme',
  enabled: true,
  installedVersionInCache: true,
  declared: { command: COMMAND, mode: 'copy' },
  accepted: { command: COMMAND, mode: 'copy' },
  ...extra,
});

const plan = (
  event: RerunEvent,
  extra: Partial<CommandPlugin> = {},
  env: Record<string, string> = {},
) => commandSourceRuns(event, plugin(extra), fakeEnvironment(env));

const runsOf = (
  event: RerunEvent,
  extra: Partial<CommandPlugin> = {},
  env: Record<string, string> = {},
) => plan(event, extra, env).runs;

const TRAFFIC = { CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' };

spec('updates.loading.When a command source re-runs', () => {
  test('every install and every update runs the accepted command', () => {
    expect(runsOf('install')).toEqual(['install']);
    expect(runsOf('update')).toEqual(['update']);
  });

  test('once per session, in the background, an enabled command-sourced plugin runs again', () => {
    expect(runsOf('session-start')).toEqual(['once-per-session']);
  });

  test('the session run does not depend on the marketplace auto-update setting or DISABLE_AUTOUPDATER', () => {
    expect(runsOf('session-start', {}, { DISABLE_AUTOUPDATER: '1', DISABLE_UPDATES: '1' })).toEqual(
      ['once-per-session'],
    );
  });

  test('at startup, an enabled plugin whose installed version is missing from the cache runs too', () => {
    expect(runsOf('session-start', { installedVersionInCache: false })).toEqual([
      'once-per-session',
      'missing-version',
    ]);
  });

  test('on /reload-plugins only the missing-version run applies', () => {
    expect(runsOf('reload-plugins', { installedVersionInCache: false })).toEqual([
      'missing-version',
    ]);
    expect(runsOf('reload-plugins')).toEqual([]);
  });

  test('CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC skips the two background runs', () => {
    const skipped = plan('session-start', { installedVersionInCache: false }, TRAFFIC);
    expect(skipped.runs).toEqual([]);
    expect(skipped.skipped).toEqual([
      { run: 'once-per-session', reason: 'nonessential-traffic-disabled' },
      { run: 'missing-version', reason: 'nonessential-traffic-disabled' },
    ]);
    expect(runsOf('reload-plugins', { installedVersionInCache: false }, TRAFFIC)).toEqual([]);
  });

  test('explicit installs and updates still run the command with that variable set', () => {
    expect(runsOf('install', {}, TRAFFIC)).toEqual(['install']);
    expect(runsOf('update', {}, TRAFFIC)).toEqual(['update']);
  });

  test('a changed hash installs the output as a new version and reloads it in the interactive session', () => {
    expect(
      afterCommandRun({
        installedVersion: 'a1b2c3d4e5f6',
        computedVersion: '0f9e8d7c6b5a',
        interactive: true,
        reloadInvalidatesPromptCache: false,
      }),
    ).toMatchObject({ install: true, followUp: 'reload' });
  });

  test('when reloading would invalidate the prompt cache it asks for /reload-plugins instead', () => {
    expect(
      afterCommandRun({
        installedVersion: 'a1b2c3d4e5f6',
        computedVersion: '0f9e8d7c6b5a',
        interactive: true,
        reloadInvalidatesPromptCache: true,
      }),
    ).toMatchObject({ install: true, followUp: 'ask-reload-plugins' });
  });

  test('an unchanged hash installs nothing and reloads nothing', () => {
    expect(
      afterCommandRun({
        installedVersion: 'a1b2c3d4e5f6',
        computedVersion: 'a1b2c3d4e5f6',
        interactive: true,
        reloadInvalidatesPromptCache: false,
      }),
    ).toEqual({ install: false, followUp: 'nothing' });
  });
});

spec('updates.hosting.Change the command of a command source', () => {
  const changed = { declared: { command: 'my-tool print-plugin --v2', mode: 'copy' as const } };
  const switched = { declared: { command: COMMAND, mode: 'link' as const } };

  test('a changed command stops the once-per-session run', () => {
    const result = plan('session-start', changed);
    expect(result.runs).toEqual([]);
    expect(result.skipped).toEqual([{ run: 'once-per-session', reason: 'command-not-accepted' }]);
  });

  test('so does a switched mode', () => {
    expect(runsOf('session-start', switched)).toEqual([]);
  });

  test('it also stops the run for a missing installed version', () => {
    expect(runsOf('session-start', { ...changed, installedVersionInCache: false })).toEqual([]);
    expect(runsOf('reload-plugins', { ...changed, installedVersionInCache: false })).toEqual([]);
  });

  test('the Errors tab gets an entry with the new command and the claude plugin update command to run', () => {
    const entry = plan('session-start', changed).errorsTab;
    expect(entry).toMatchObject({
      plugin: 'tool@acme',
      command: 'my-tool print-plugin --v2',
      updateCommand: 'claude plugin update tool@acme',
      issue: { severity: 'error', path: 'plugins.tool@acme' },
    });
    expect(entry?.issue.message).toContain('my-tool print-plugin --v2');
    expect(entry?.issue.message).toContain('claude plugin update tool@acme');
  });

  test('the entry of a switched mode shows the mode, since the command alone did not change', () => {
    const entry = plan('session-start', switched).errorsTab;
    expect(entry?.mode).toBe('link');
    expect(entry?.issue.message).toContain('link');
  });

  test('claude plugin update shows the new command and asks the user to accept it, and runs it', () => {
    const result = plan('update', changed);
    expect(result.runs).toEqual(['update']);
    expect(result.acceptance).toEqual({ ask: true, showing: 'my-tool print-plugin --v2' });
    expect(result.errorsTab).toBeUndefined();
  });

  test('an unchanged command needs no acceptance and no Errors-tab entry', () => {
    const result = plan('update');
    expect(result.acceptance).toEqual({ ask: false });
    expect(plan('session-start').errorsTab).toBeUndefined();
  });

  test('an install always shows the command it will run and asks', () => {
    const { accepted: _never, ...fresh } = plugin();
    expect(commandSourceRuns('install', fresh, fakeEnvironment()).acceptance).toEqual({
      ask: true,
      showing: COMMAND,
    });
    expect(plan('install').acceptance).toEqual({ ask: true, showing: COMMAND });
  });
});

describe('command source re-runs, what the docs leave open (spec/judgments.md)', () => {
  test('a disabled plugin has no background run, and an install or update still runs', () => {
    expect(runsOf('session-start', { enabled: false })).toEqual([]);
    expect(runsOf('reload-plugins', { enabled: false, installedVersionInCache: false })).toEqual(
      [],
    );
    expect(runsOf('update', { enabled: false })).toEqual(['update']);
  });

  test('a changed command wins over the traffic variable as the reason, and the Errors-tab entry stays', () => {
    const result = plan('session-start', { declared: { command: 'other', mode: 'copy' } }, TRAFFIC);
    expect(result.skipped).toEqual([{ run: 'once-per-session', reason: 'command-not-accepted' }]);
    expect(result.errorsTab).toBeDefined();
  });

  test('a non-interactive session installs the new version and loads it at the next launch', () => {
    expect(
      afterCommandRun({
        installedVersion: 'a',
        computedVersion: 'b',
        interactive: false,
        reloadInvalidatesPromptCache: false,
      }),
    ).toMatchObject({ install: true, followUp: 'next-launch' });
  });

  test('a plugin that was never installed installs from its first run', () => {
    expect(
      afterCommandRun({
        installedVersion: undefined,
        computedVersion: 'b',
        interactive: true,
        reloadInvalidatesPromptCache: false,
      }),
    ).toMatchObject({ install: true, followUp: 'reload' });
  });
});
