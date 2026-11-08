/**
 * plugins/troubleshooting.md § "`Failed to load hooks from <path>: <reason>` and hooks that don't
 * fire": "Hooks fail to load" (the three load messages), "`hook error` notices in the transcript"
 * (`Failed with non-blocking status code:`, the path cut off at a space, `Plugin directory does
 * not exist`); the last two sections are in `troubleshooting-fires.test.ts`.
 */
import { expect, test } from 'bun:test';
import { createHookEngine, createHookRegistry } from '../../src/hooks/index.ts';
import { loadPlugin } from '../../src/index.ts';
import { entry, FACTS, pluginSource, session } from '../support/hooks-select.ts';
import { exited, verdictOf } from '../support/hooks-verdict.ts';
import { fakeEnvironment, locations, memoryFiles, scriptedRunner } from '../support/ports.ts';
import { hooksFile, json, messagesOf } from '../support/plugin-folder.ts';
import { spec } from '../support/spec.ts';

const load = (tree: Parameters<typeof memoryFiles>[0]) => loadPlugin({ files: memoryFiles(tree) });
const plugin = (extra: Record<string, unknown> = {}) => json({ name: 'formatter', ...extra });

spec('hooks.troubleshooting.Hooks fail to load', () => {
  test('hooks/hooks.json that is not valid JSON: "Failed to load hooks from <path>: <reason>"', async () => {
    const { issues, plugin: loaded } = await load({
      '.claude-plugin/plugin.json': plugin(),
      'hooks/hooks.json': '{ not json',
    });
    expect(loaded?.hooks).toEqual({});
    expect(messagesOf(issues)).toEqual([
      expect.stringMatching(/^Failed to load hooks from hooks\/hooks\.json: .+/),
    ]);
  });

  test('or that fails the hooks schema: the reason names the validation error', async () => {
    const { issues } = await load({
      '.claude-plugin/plugin.json': plugin(),
      'hooks/hooks.json': json({ hooks: 'nope' }),
    });
    expect(messagesOf(issues)[0]).toStartWith('Failed to load hooks from hooks/hooks.json: ');
    expect(messagesOf(issues)[0]).toContain('must be an object');
  });

  test('the manifest `hooks` names a file that does not exist: "hooks path not found: <path>"', async () => {
    const { issues } = await load({
      '.claude-plugin/plugin.json': plugin({ hooks: './config/missing.json' }),
    });
    expect(messagesOf(issues)).toContain('hooks path not found: ./config/missing.json');
  });

  test('the hooks file leads outside the plugin: "hooks path escapes plugin directory: <path>"', async () => {
    const { issues } = await load({
      '.claude-plugin/plugin.json': plugin(),
      'hooks/hooks.json': { symlink: '/etc/hooks.json' },
    });
    expect(messagesOf(issues)).toEqual([
      expect.stringMatching(/^hooks path escapes plugin directory: hooks\/hooks\.json/),
    ]);
  });

  test('a valid hooks file loads without a message', async () => {
    const { issues, plugin: loaded } = await load({
      '.claude-plugin/plugin.json': plugin(),
      'hooks/hooks.json': hooksFile('format.sh'),
    });
    expect(issues).toEqual([]);
    expect(Object.keys(loaded?.hooks ?? {})).toEqual(['PostToolUse']);
  });
});

const formatter = pluginSource('formatter');
const stopHook = (command = 'node') =>
  entry('Stop', {
    source: formatter,
    pluginId: 'formatter@acme-tools',
    handler: { type: 'command', command, args: ['${CLAUDE_PLUGIN_ROOT}/hooks/check.js'] },
  });

const dispatchStop = async (options: { checkPluginDirectories?: boolean }) => {
  const runner = scriptedRunner({});
  const engine = createHookEngine(
    { commands: runner, locations: locations(), environment: fakeEnvironment({}) },
    options,
  );
  const outcome = await engine.dispatch(createHookRegistry([stopHook()]), {
    event: 'Stop',
    facts: FACTS.Stop,
    session: session(),
    signal: new AbortController().signal,
  });
  return { calls: runner.calls.length, notices: outcome.notices.length };
};

spec('hooks.troubleshooting.hook error notices in the transcript', () => {
  test('a command that failed: "... hook error: Failed with non-blocking status code: <stderr>"', () => {
    const stderr = '/bin/sh: node: command not found';
    const verdict = verdictOf('Stop', exited(127, stderr), { entry: stopHook() });
    expect(verdict.status).toBe('non-blocking-error');
    expect(verdict.notice?.message).toStartWith('Stop hook error: ');
    expect(verdict.notice?.message).toEndWith(
      `Failed with non-blocking status code: /bin/sh: node: command not found`,
    );
  });

  test('a path cut off at a space: an unquoted ${CLAUDE_PLUGIN_ROOT} in shell form splits there, a quoted one and exec form do not', async () => {
    const spaced = locations({
      plugins: '/Users/me/My Plugins',
      directories: ['/Users/me/My Plugins/formatter@acme-tools'],
    });
    const ran = async (handler: { command: string; args?: string[] }) => {
      const runner = scriptedRunner({});
      const engine = createHookEngine({
        commands: runner,
        locations: spaced,
        environment: fakeEnvironment({}),
      });
      const hook = entry('Stop', {
        source: formatter,
        pluginId: 'formatter@acme-tools',
        handler: { type: 'command', ...handler },
      });
      await engine.dispatch(createHookRegistry([hook]), {
        event: 'Stop',
        facts: FACTS.Stop,
        session: session(),
        signal: new AbortController().signal,
      });
      return runner.calls[0]?.spec;
    };
    expect(await ran({ command: '${CLAUDE_PLUGIN_ROOT}/run.sh' })).toEqual({
      form: 'shell',
      shell: 'bash',
      command: '/Users/me/My Plugins/formatter@acme-tools/run.sh',
    });
    expect(await ran({ command: '"${CLAUDE_PLUGIN_ROOT}"/run.sh' })).toMatchObject({
      command: '"/Users/me/My Plugins/formatter@acme-tools"/run.sh',
    });
    expect(await ran({ command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/run.js'] })).toEqual({
      form: 'exec',
      command: 'node',
      args: ['/Users/me/My Plugins/formatter@acme-tools/run.js'],
    });
  });

  test('the plugin directory is gone: "Failed to run: Plugin directory does not exist: <path> (<plugin> — run /plugin to reinstall)", the hook does not run', async () => {
    const runner = scriptedRunner({});
    const engine = createHookEngine(
      { commands: runner, locations: locations(), environment: fakeEnvironment({}) },
      { checkPluginDirectories: true },
    );
    const outcome = await engine.dispatch(createHookRegistry([stopHook()]), {
      event: 'Stop',
      facts: FACTS.Stop,
      session: session(),
      signal: new AbortController().signal,
    });
    expect(runner.calls).toHaveLength(0);
    expect(outcome.notices[0]?.message).toEndWith(
      'Failed to run: Plugin directory does not exist: /plugins/formatter@acme-tools (formatter — run /plugin to reinstall)',
    );
    expect(outcome.proceed).toBe(true);
  });

  test('the check is on by default, and a host that never re-reads its plugins can turn it off', async () => {
    expect(await dispatchStop({})).toEqual({ calls: 0, notices: 1 });
    expect(await dispatchStop({ checkPluginDirectories: false })).toEqual({ calls: 1, notices: 0 });
  });

  test('a plugin without a manifest name is named by its id in the notice', async () => {
    const runner = scriptedRunner({});
    const engine = createHookEngine({
      commands: runner,
      locations: locations(),
      environment: fakeEnvironment({}),
    });
    const unnamed = entry('Stop', {
      source: { kind: 'plugin', label: '[plugin]' },
      pluginId: 'formatter@acme-tools',
      handler: { type: 'command', command: './check.sh' },
    });
    const outcome = await engine.dispatch(createHookRegistry([unnamed]), {
      event: 'Stop',
      facts: FACTS.Stop,
      session: session(),
      signal: new AbortController().signal,
    });
    expect(outcome.notices[0]?.message).toEndWith(
      '(formatter@acme-tools — run /plugin to reinstall)',
    );
  });

  test('the plugin directory is there: the hook runs', async () => {
    const runner = scriptedRunner({});
    const engine = createHookEngine(
      {
        commands: runner,
        locations: locations({ directories: ['/plugins/formatter@acme-tools', '/work/app'] }),
        environment: fakeEnvironment({}),
      },
      { checkPluginDirectories: true },
    );
    await engine.dispatch(createHookRegistry([stopHook()]), {
      event: 'Stop',
      facts: FACTS.Stop,
      session: session(),
      signal: new AbortController().signal,
    });
    expect(runner.calls).toHaveLength(1);
  });
});
