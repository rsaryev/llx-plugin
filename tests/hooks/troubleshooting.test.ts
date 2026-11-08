/**
 * plugins/troubleshooting.md § "`Failed to load hooks from <path>: <reason>` and hooks that don't
 * fire": "Hooks fail to load" (the three load messages), "`hook error` notices in the transcript"
 * (`Failed with non-blocking status code:`, the path cut off at a space, `Plugin directory does
 * not exist`), "A plugin hook blocks a tool call or prompt" (`This hook comes from the <plugin>
 * plugin.`) and "Hook loads but never fires" (event names are case-sensitive, the matcher must
 * match the tool name, the debug log records which hooks matched).
 */
import { describe, expect, test } from 'bun:test';
import { readHooksFile } from '../../src/format/index.ts';
import {
  createHookEngine,
  createHookRegistry,
  type HookObserver,
  registerHooks,
} from '../../src/hooks/index.ts';
import { loadPlugin } from '../../src/index.ts';
import { entry, FACTS, pluginSource, session } from '../support/hooks-select.ts';
import { file, warningsOf } from '../support/hooks-read.ts';
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
    const spaced = locations({ plugins: '/Users/me/My Plugins' });
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

spec('hooks.troubleshooting.A plugin hook blocks a tool call or prompt', () => {
  const guard = (event: 'PreToolUse' | 'UserPromptSubmit', name: string) =>
    entry(event, { source: pluginSource(name), pluginId: `${name}@acme-tools` });

  test('a plugin hook that exits 2 with its stderr as the message: the error ends with "This hook comes from the <plugin> plugin."', () => {
    const verdict = verdictOf('PreToolUse', exited(2, 'rm is not allowed'), {
      entry: guard('PreToolUse', 'safety'),
    });
    expect(verdict.block?.message).toEndWith(
      'rm is not allowed This hook comes from the safety plugin.',
    );
    expect(verdict.block?.message).toStartWith('PreToolUse:Bash hook error: ');
  });

  test('the same for a blocked prompt', () => {
    const verdict = verdictOf('UserPromptSubmit', exited(2, 'no secrets'), {
      entry: guard('UserPromptSubmit', 'safety'),
    });
    expect(verdict.block?.message).toEndWith('This hook comes from the safety plugin.');
  });

  test("a hook that is not a plugin's names no plugin", () => {
    const settings = verdictOf('PreToolUse', exited(2, 'rm is not allowed'));
    expect(settings.block?.message).not.toContain('This hook comes from');
    const skill = verdictOf('PreToolUse', exited(2, 'x'), { entry: entry('PreToolUse') });
    expect(skill.block?.message).not.toContain('plugin.');
  });

  test("the reason Claude is given stays the hook's stderr", () => {
    const verdict = verdictOf('PreToolUse', exited(2, 'rm is not allowed'), {
      entry: guard('PreToolUse', 'safety'),
    });
    expect(verdict.block?.reason).toBe('rm is not allowed');
  });

  test('a failure that is not exit 2 does not name the plugin: only a block by exit code 2 does', () => {
    const verdict = verdictOf('PreToolUse', exited(1, 'boom'), {
      entry: guard('PreToolUse', 'safety'),
    });
    expect(verdict.notice?.message).not.toContain('This hook comes from');
  });
});

describe('Hook loads but never fires', () => {
  const afterEdit = (event: string, matcher: string) =>
    registerHooks(
      readHooksFile(
        file({ [event]: [{ matcher, hooks: [{ type: 'command', command: './fmt.sh' }] }] }),
      ).hooks,
      { idPrefix: 'p', source: formatter },
    );

  const fires = async (
    registered: ReturnType<typeof afterEdit>,
    tool: string,
    observer?: HookObserver,
  ) => {
    const runner = scriptedRunner({});
    const engine = createHookEngine({
      commands: runner,
      locations: locations(),
      environment: fakeEnvironment({}),
      ...(observer === undefined ? {} : { observer }),
    });
    await engine.dispatch(createHookRegistry(registered), {
      event: 'PostToolUse',
      facts: { ...FACTS.PostToolUse, tool_name: tool },
      session: session(),
      signal: new AbortController().signal,
    });
    return runner.calls.length;
  };

  spec('hooks.troubleshooting.Hook loads but never fires', () => {
    test('1. event names are case-sensitive: "posttooluse" loads, warns and never fires; "PostToolUse" fires', async () => {
      const wrong = readHooksFile(
        file({ posttooluse: [{ hooks: [{ type: 'command', command: './fmt.sh' }] }] }),
      );
      expect(warningsOf(wrong).map((found) => found.message)).toEqual([
        '"posttooluse" is not a hook event',
      ]);
      expect(await fires(afterEdit('posttooluse', 'Edit'), 'Edit')).toBe(0);
      expect(await fires(afterEdit('PostToolUse', 'Edit'), 'Edit')).toBe(1);
    });

    test('2. the matcher must match the tool name: Write does not fire the Edit hook, an exact name and an alternation do', async () => {
      expect(await fires(afterEdit('PostToolUse', 'Edit'), 'Write')).toBe(0);
      expect(await fires(afterEdit('PostToolUse', 'Edit'), 'Edit')).toBe(1);
      expect(await fires(afterEdit('PostToolUse', 'Write|Edit'), 'Write')).toBe(1);
      expect(await fires(afterEdit('PostToolUse', 'edit'), 'Edit')).toBe(0);
    });

    test('3. triggering the event on purpose: a PostToolUse hook runs on an edit result', async () => {
      expect(await fires(afterEdit('PostToolUse', 'Edit|Write'), 'Edit')).toBe(1);
    });

    test('4. the log records which hooks ran, and a hook that ran shows its result', async () => {
      const log: string[] = [];
      const observer: HookObserver = {
        started: (info) => log.push(`started ${info.handlerId}`),
        finished: (info) => log.push(`finished ${info.handlerId} ${info.status}`),
      };
      await fires(afterEdit('PostToolUse', 'Edit'), 'Edit', observer);
      await fires(afterEdit('PostToolUse', 'Edit'), 'Write', observer);
      expect(log).toEqual(['started p:PostToolUse:0:0', 'finished p:PostToolUse:0:0 success']);
    });
  });
});
