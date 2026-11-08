/**
 * plugins/manifest-reference.md § Where each variable resolves (Monitor commands: `${...}` "Anywhere
 * in `command`", "Not exported"), § Fields that run through a shell (monitor commands reject
 * `${user_config.*}`; "Monitor processes don't receive `CLAUDE_PLUGIN_OPTION_<KEY>`"); plugins/
 * components.md § Monitors ("`command` gets the path variables and `${ENV_VAR}` from the
 * environment, but never `${user_config.*}`. A monitor that references one doesn't start");
 * errors.md § Plugin command references user_config in a shell command (the monitor message, and
 * "The check runs on the command template, so the error appears even when no value is configured yet").
 *
 * The kit never spawns the process: the resolved monitor is what the host runs, and its
 * `environment` is the extra variables the host would set (none).
 */
import { describe, expect, test } from 'bun:test';
import { resolveMonitor, type Monitor, type ResolvedMonitor } from '../../../src/index.ts';
import { locations } from '../../support/ports.ts';
import { PATHS, scopeOf, userConfig } from '../../support/mcp-scope.ts';
import { windowsLocations } from '../../support/windows-locations.ts';
import { spec } from '../../support/spec.ts';

const monitor = (overrides: Partial<Monitor> = {}): Monitor => ({
  name: 'deploy-status',
  command: 'tail -F ./logs/error.log',
  description: 'Deployment status changes',
  when: { kind: 'always' },
  ...overrides,
});

const resolve = async (value: Monitor, scope = scopeOf()): Promise<ResolvedMonitor> => {
  const { resolved, issues } = await resolveMonitor(value, scope);
  expect(issues).toEqual([]);
  if (!resolved) throw new Error('the monitor did not resolve');
  return resolved;
};

const MESSAGE =
  'Monitor "deploy-status" from plugin my-plugin@acme-tools references ${user_config.*} in its command. The substituted value would be passed to a shell. Monitor commands cannot safely reference ${user_config.*}; have the monitor script read the value from a config file or prompt instead.';

spec('environment.component.Monitor commands', () => {
  const everywhere = '${CLAUDE_PLUGIN_ROOT}|${CLAUDE_PLUGIN_DATA}|${CLAUDE_PROJECT_DIR}';
  const expected = `${PATHS.CLAUDE_PLUGIN_ROOT}|${PATHS.CLAUDE_PLUGIN_DATA}|${PATHS.CLAUDE_PROJECT_DIR}`;

  test('the three path variables resolve anywhere in command, every occurrence', async () => {
    const resolved = await resolve(
      monitor({
        command: `echo ${everywhere} && ls \${CLAUDE_PLUGIN_ROOT}/a \${CLAUDE_PLUGIN_ROOT}/b`,
      }),
    );
    expect(resolved.command).toBe(
      `echo ${expected} && ls ${PATHS.CLAUDE_PLUGIN_ROOT}/a ${PATHS.CLAUDE_PLUGIN_ROOT}/b`,
    );
  });

  test('the manifest-reference example resolves to a quoted script path', async () => {
    const resolved = await resolve(
      monitor({
        command: '"${CLAUDE_PLUGIN_ROOT}"/scripts/poll-deploy.sh',
        when: { kind: 'on-skill-invoke', skill: 'deploy' },
      }),
    );
    expect(resolved.command).toBe(`"${PATHS.CLAUDE_PLUGIN_ROOT}"/scripts/poll-deploy.sh`);
    expect(resolved.when).toEqual({ kind: 'on-skill-invoke', skill: 'deploy' });
  });

  test('${ENV_VAR} comes from the environment, and a default stands in for an unset one', async () => {
    const resolved = await resolve(monitor({ command: 'psql ${DB_URL} -c "${QUERY:-select 1}"' }));
    expect(resolved.command).toBe('psql postgres://db -c "select 1"');
  });

  test('an unset ${ENV_VAR} without a default stays as written and is reported as a warning', async () => {
    const { resolved, issues } = await resolveMonitor(
      monitor({ command: 'run ${NOPE}' }),
      scopeOf(),
    );
    expect(resolved?.command).toBe('run ${NOPE}');
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      severity: 'warning',
      path: 'monitors.deploy-status.command',
    });
  });

  test('resolves in no other field: description and the skill of `when` stay literal', async () => {
    const resolved = await resolve(
      monitor({
        name: 'n',
        description: everywhere,
        command: 'x',
        when: { kind: 'on-skill-invoke', skill: '${CLAUDE_PLUGIN_ROOT}' },
      }),
    );
    expect(resolved.name).toBe('n');
    expect(resolved.description).toBe(everywhere);
    expect(resolved.when).toEqual({ kind: 'on-skill-invoke', skill: '${CLAUDE_PLUGIN_ROOT}' });
  });

  test('configured options are not exported: no variable starts with CLAUDE_PLUGIN_OPTION_', async () => {
    const configured = scopeOf({
      userConfig: { declared: userConfig.declared, values: { api_token: 's3cret', region: 'eu' } },
    });
    const resolved = await resolve(monitor({ command: `echo ${everywhere}` }), configured);
    const prefixed = Object.keys(resolved.environment).filter((key) =>
      key.startsWith('CLAUDE_PLUGIN_OPTION_'),
    );
    expect(prefixed).toEqual([]);
  });

  test('a Windows host gets forward slashes in the command, so a quoted path stays one word', async () => {
    const scope = scopeOf({ locations: windowsLocations(), windows: true });
    const resolved = await resolve(monitor({ command: '"${CLAUDE_PLUGIN_ROOT}"/run.sh' }), scope);
    expect(resolved.command).toBe(
      '"C:/Users/you/.claude/plugins/cache/my-plugin@acme-tools"/run.sh',
    );
    expect(resolved.environment).toEqual({});
  });

  test('the data folder is created only when the command references it', async () => {
    const host = locations();
    await resolve(monitor({ command: '${CLAUDE_PLUGIN_ROOT}/a' }), scopeOf({ locations: host }));
    expect(host.dataCreated).toEqual([]);
    await resolve(monitor({ command: '${CLAUDE_PLUGIN_DATA}/a' }), scopeOf({ locations: host }));
    expect(host.dataCreated).toEqual(['my-plugin-acme-tools']);
  });
});

spec('userConfig.shell.Monitor commands', () => {
  test('a command that references ${user_config.*} does not start, with the errors.md message', async () => {
    const { resolved, issues } = await resolveMonitor(
      monitor({ command: './poll.sh ${user_config.region}' }),
      scopeOf(),
    );
    expect(resolved).toBeUndefined();
    expect(issues).toEqual([
      { severity: 'error', path: 'monitors.deploy-status.command', message: MESSAGE },
    ]);
  });

  test('the check reads the template: it fires with no value configured and for an undeclared key', async () => {
    const empty = scopeOf({ userConfig: { declared: userConfig.declared, values: {} } });
    for (const key of ['region', 'api_token', 'never_declared']) {
      const { resolved, issues } = await resolveMonitor(
        monitor({ command: `./poll.sh \${user_config.${key}}` }),
        empty,
      );
      expect(resolved).toBeUndefined();
      expect(issues.map((found) => found.message)).toEqual([MESSAGE]);
    }
  });

  test('the monitor and plugin named in the message are those of the monitor and the scope', async () => {
    const { issues } = await resolveMonitor(
      monitor({ name: 'other', command: '${user_config.region}' }),
      scopeOf({ pluginId: 'deploy-tools' }),
    );
    expect(
      issues[0]?.message.startsWith('Monitor "other" from plugin deploy-tools references'),
    ).toBe(true);
  });

  test('a configured value never reaches the command: a hostile value is not substituted into a shell', async () => {
    const hostile = scopeOf({
      userConfig: { declared: userConfig.declared, values: { region: '$(touch x); `id`' } },
    });
    const { resolved } = await resolveMonitor(
      monitor({ command: './poll.sh ${user_config.region}' }),
      hostile,
    );
    expect(resolved).toBeUndefined();
  });

  test('a command without the reference starts even when options are configured, and gets no CLAUDE_PLUGIN_OPTION_ variable', async () => {
    const resolved = await resolve(monitor({ command: './poll.sh' }));
    expect(resolved.command).toBe('./poll.sh');
    expect(Object.keys(resolved.environment)).toEqual([]);
  });

  test('only the command is checked: ${user_config.*} in the description is not an error', async () => {
    const { resolved, issues } = await resolveMonitor(
      monitor({ description: 'region ${user_config.region}' }),
      scopeOf(),
    );
    expect(issues).toEqual([]);
    expect(resolved?.description).toBe('region ${user_config.region}');
  });
});

describe('judgments (spec/judgments.md)', () => {
  test('the message names the plugin as the host identifies it, marketplace included', async () => {
    const { issues } = await resolveMonitor(
      monitor({ command: '${user_config.region}' }),
      scopeOf({ pluginId: 'formatter@acme-tools' }),
    );
    expect(issues[0]?.message).toContain('from plugin formatter@acme-tools references');
  });
});
