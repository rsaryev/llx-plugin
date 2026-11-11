/**
 * plugins/troubleshooting.md § "A plugin hook blocks a tool call or prompt" (`This hook comes from
 * the <plugin> plugin.`, and where it sits next to hooks.md's `Original prompt:`) and § "Hook loads
 * but never fires" (event names are case-sensitive, the matcher must match the tool name, the debug
 * log records which hooks matched and, for a hook that ran, its exit code).
 */
import { describe, expect, test } from 'bun:test';
import { readHooksFile } from '../../src/format/index.ts';
import { createHookEngine, createHookRegistry, type HookObserver } from '../../src/hooks/index.ts';
import { entry, FACTS, pluginSource, session } from '../support/hooks-select.ts';
import { file, warningsOf } from '../support/hooks-read.ts';
import { engineSession } from '../support/hooks-session.ts';
import { exited, verdictOf } from '../support/hooks-verdict.ts';
import { fakeEnvironment, locations, scriptedRunner, type RunnerReply } from '../support/ports.ts';
import { spec } from '../support/spec.ts';
import { registerHooks } from '../../src/hooks/register.ts';

const formatter = pluginSource('formatter');

const guard = (event: 'PreToolUse' | 'UserPromptSubmit', name: string) =>
  entry(event, { source: pluginSource(name), pluginId: `${name}@acme-tools` });

spec('hooks.troubleshooting.A plugin hook blocks a tool call or prompt', () => {
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

  test('only a stderr that is the blocking message gets the sentence: a hook with no stderr has none', () => {
    const verdict = verdictOf('PreToolUse', exited(2, ''), {
      entry: guard('PreToolUse', 'safety'),
    });
    expect(verdict.block?.message).not.toContain('This hook comes from');
    expect(verdict.block?.reason).toBe('');
  });

  test('an exit-2 plugin hook whose block comes from a JSON decision reason, not its stderr, has no sentence', async () => {
    const stop = entry('Stop', { source: pluginSource('safety'), pluginId: 'safety@acme-tools' });
    const decision = JSON.stringify({ decision: 'block', reason: 'b' });
    const { fire } = engineSession([stop], [{ exitCode: 2, stderr: 'a', stdout: decision }], {
      pluginIds: ['safety@acme-tools'],
    });
    const outcome = await fire('Stop');
    expect(outcome.block?.reason).toBe('b');
    expect(outcome.block?.message).not.toContain('This hook comes from');
  });

  test('a blocked prompt ends with the plugin sentence first and "Original prompt:" last (judgment)', async () => {
    const { fire } = engineSession(
      [guard('UserPromptSubmit', 'safety')],
      [{ exitCode: 2, stderr: 'no secrets' }],
      { pluginIds: ['safety@acme-tools'] },
    );
    const outcome = await fire('UserPromptSubmit', { facts: { prompt: 'deploy the secret' } });
    expect(outcome.block?.message).toEndWith(
      'no secrets This hook comes from the safety plugin.\nOriginal prompt: deploy the secret',
    );
  });

  test('a plugin without a manifest name is named by its id, the same as in the missing directory notice', () => {
    const unnamed = entry('PreToolUse', {
      source: { kind: 'plugin', label: '[plugin]' },
      pluginId: 'safety@acme-tools',
    });
    const verdict = verdictOf('PreToolUse', exited(2, 'no'), { entry: unnamed });
    expect(verdict.block?.message).toEndWith('This hook comes from the safety@acme-tools plugin.');
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

const afterEdit = (event: string, matcher: string) =>
  registerHooks(
    readHooksFile(
      file({ [event]: [{ matcher, hooks: [{ type: 'command', command: './fmt.sh' }] }] }),
    ).hooks,
    { idPrefix: 'p', source: formatter },
  );

describe('Hook loads but never fires', () => {
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

  spec(['hooks.troubleshooting.Hook loads but never fires', 'cli.debug.Check hooks'], () => {
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
        finished: (info) =>
          log.push(`finished ${info.handlerId} ${info.status} exit ${info.exitCode ?? 'none'}`),
      };
      await fires(afterEdit('PostToolUse', 'Edit'), 'Edit', observer);
      await fires(afterEdit('PostToolUse', 'Edit'), 'Write', observer);
      expect(log).toEqual([
        'started p:PostToolUse:0:0',
        'finished p:PostToolUse:0:0 success exit 0',
      ]);
    });

    test('4. the exit code of a hook that failed is in the log, and a run with no exit code has none', async () => {
      const finished: Array<number | undefined> = [];
      const observer: HookObserver = { finished: (info) => finished.push(info.exitCode) };
      const engineOver = (reply: RunnerReply) =>
        createHookEngine({
          commands: scriptedRunner(reply),
          locations: locations(),
          environment: fakeEnvironment({}),
          observer,
        });
      const hook = entry('Stop', { handler: { type: 'command', command: './check.sh' } });
      for (const reply of [
        { exitCode: 2, stderr: 'no' },
        { exitCode: null, timedOut: true },
      ]) {
        await engineOver(reply).dispatch(createHookRegistry([hook]), {
          event: 'Stop',
          facts: FACTS.Stop,
          session: session(),
          signal: new AbortController().signal,
        });
      }
      expect(finished).toEqual([2, undefined]);
    });
  });
});
