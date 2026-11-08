/**
 * hooks.md, "Setup decision control", "InstructionsLoaded decision control" and "PermissionDenied
 * decision control": what each hook can and cannot do, which JSON fields the event discards. The
 * docs' scripts are played as a scripted runner through the real engine and output stage.
 */
import { expect, test } from 'bun:test';
import { createEnvFiles, createHookEngine, createHookRegistry } from '../../../src/hooks/index.ts';
import { memoryEnvFiles } from '../../support/env-files.ts';
import { fire } from '../../support/hooks-fire.ts';
import { answer, fireModelHook, promptHook } from '../../support/hooks-model-fire.ts';
import { specific, stage, viaEngine } from '../../support/hooks-output.ts';
import { runScript } from '../../support/hooks-script.ts';
import { entry, FACTS, session } from '../../support/hooks-select.ts';
import { fakeEnvironment, locations, scriptedRunner } from '../../support/ports.ts';
import { spec } from '../../support/spec.ts';
import { stdinJson } from '../../support/stdin.ts';

/** A `PermissionDenied` hook's `retry` answer. */
const retry = (value: boolean) => specific('PermissionDenied', { retry: value });

spec('hooks.behavior.Setup decision control', () => {
  const FIELDS = {
    continue: false,
    stopReason: 'halt',
    systemMessage: 'installed',
    hookSpecificOutput: { hookEventName: 'Setup', additionalContext: 'deps installed' },
  };

  test.each([0, 1, 2, 3, 127])(
    'execution continues on exit code %i: Setup hooks cannot block',
    async (exitCode) => {
      const outcome = await runScript('Setup', { exitCode, stderr: 'failed' }, FACTS.Setup);
      expect(outcome.proceed).toBe(true);
      expect(outcome.continue).toBe(true);
      expect(outcome.block).toBeUndefined();
    },
  );

  test.each([0, 1, 2])(
    'on exit code %i the JSON output fields are discarded: systemMessage, continue and additionalContext',
    async (exitCode) => {
      const outcome = await runScript(
        'Setup',
        { exitCode, stdout: JSON.stringify(FIELDS) },
        FACTS.Setup,
      );
      expect(outcome.continue).toBe(true);
      expect(outcome.stopReason).toBeUndefined();
      expect(outcome.systemMessages).toEqual([]);
      expect(outcome.additionalContext).toEqual([]);
    },
  );

  test('plain stdout is not added to Claude context either', async () => {
    const outcome = await runScript('Setup', { stdout: 'npm install done' }, FACTS.Setup);
    expect(outcome.additionalContext).toEqual([]);
  });

  // hooks.md: "a Setup hook's stdout, stderr, and exit code appear ... only as `hook_response`
  // events". The event is the host's to write; the kit's part is the report of the run with its
  // exit code (`HookObserver.finished` carries no stdout or stderr).
  test('the exit code of a Setup hook reaches the host in the finished report, for its hook_response event', async () => {
    const finished: unknown[] = [];
    await fire('Setup', [entry('Setup')], [{ exitCode: 3, stdout: 'out', stderr: 'err' }], {
      output: stage,
      observer: { finished: (info) => finished.push(info) },
    });
    expect(finished).toMatchObject([{ event: 'Setup', exitCode: 3 }]);
  });

  test('Setup hooks have access to CLAUDE_ENV_FILE, the file the session keeps for the Bash tool', async () => {
    const runner = scriptedRunner({});
    const engine = createHookEngine(
      { commands: runner, locations: locations(), environment: fakeEnvironment() },
      { envFiles: createEnvFiles(memoryEnvFiles()) },
    );
    await engine.dispatch(createHookRegistry([entry('Setup')]), {
      event: 'Setup',
      facts: FACTS.Setup,
      session: session(),
      signal: new AbortController().signal,
    });
    expect(runner.calls[0]?.env['CLAUDE_ENV_FILE']).toBe('/session/session-env.sh');
  });

  test('only command hooks run on Setup: an mcp_tool hook is always skipped, and so are the other types', async () => {
    for (const handler of [
      { type: 'mcp_tool', server: 's', tool: 't' },
      { type: 'http', url: 'http://x.test/h' },
      { type: 'prompt', prompt: 'p' },
      { type: 'agent', prompt: 'p' },
    ] as const) {
      const { outcome, runner } = await fire('Setup', [entry('Setup', { handler })], [], {
        output: stage,
      });
      expect(outcome.runs).toEqual([]);
      expect(runner.calls).toEqual([]);
      expect(outcome.issues).toHaveLength(1);
    }
    const { outcome } = await fire('Setup', [entry('Setup')], [{ exitCode: 0 }], { output: stage });
    expect(outcome.runs).toHaveLength(1);
  });
});

spec('hooks.behavior.InstructionsLoaded decision control', () => {
  test('there is no decision control: a block cannot stop or modify the loading', async () => {
    const outcome = await viaEngine('InstructionsLoaded', [
      {
        decision: 'block',
        reason: 'no',
        hookSpecificOutput: { hookEventName: 'InstructionsLoaded', additionalContext: 'x' },
      },
    ]);
    expect(outcome.proceed).toBe(true);
    expect(outcome.block).toBeUndefined();
    expect(outcome.effects).toEqual({});
    expect(outcome.additionalContext).toEqual([]);
  });

  test('its JSON output fields, such as systemMessage and continue, are discarded', async () => {
    const outcome = await viaEngine('InstructionsLoaded', [
      { systemMessage: 'loaded', continue: false, stopReason: 'stop' },
    ]);
    expect(outcome.systemMessages).toEqual([]);
    expect(outcome.continue).toBe(true);
    expect(outcome.stopReason).toBeUndefined();
  });

  test('exit code 2 blocks nothing: the hook is for audit logging', async () => {
    const outcome = await runScript(
      'InstructionsLoaded',
      { exitCode: 2, stderr: 'no' },
      FACTS.InstructionsLoaded,
    );
    expect(outcome.proceed).toBe(true);
    expect(outcome.runs.map((run) => run.status)).toEqual(['non-blocking-error']);
  });

  test('an audit script reads the file and why it was loaded, from the input', async () => {
    const seen: Record<string, unknown>[] = [];
    await runScript(
      'InstructionsLoaded',
      (run) => {
        seen.push(stdinJson(run));
        return {};
      },
      { file_path: '/p/CLAUDE.md', memory_type: 'Project', load_reason: 'session_start' },
    );
    expect(seen).toMatchObject([
      {
        hook_event_name: 'InstructionsLoaded',
        file_path: '/p/CLAUDE.md',
        memory_type: 'Project',
        load_reason: 'session_start',
      },
    ]);
  });
});

spec('hooks.behavior.PermissionDenied decision control', () => {
  test('retry: true tells the model it may retry the denied call', async () => {
    const outcome = await viaEngine('PermissionDenied', [retry(true)]);
    expect(outcome.effects.retry).toBe(true);
    // Claude Code does not reverse the denial itself
    expect(outcome.proceed).toBe(true);
    expect(outcome.block).toBeUndefined();
  });

  test('a hook that returns no JSON, or retry: false, leaves the denial standing', async () => {
    expect((await viaEngine('PermissionDenied', [''])).effects).toEqual({});
    expect((await viaEngine('PermissionDenied', [retry(false)])).effects).toEqual({});
  });

  test('retry: true is ignored when the classifier produced no verdict on the action', async () => {
    const reason =
      'Auto mode could not evaluate this action and is blocking it for safety: the classifier response did not parse';
    const outcome = await viaEngine('PermissionDenied', [retry(true)], {
      ...FACTS.PermissionDenied,
      reason,
    });
    expect(outcome.effects.retry).toBeUndefined();
    expect(outcome.issues.map((issue) => issue.path)).toEqual(['hooks.PermissionDenied.retry']);
  });

  test.each(['[Irreversible Local Destruction]', '[Data Exfiltration]', 'Classifier unavailable'])(
    'retry: true is honored for the denial reason %s',
    async (reason) => {
      const outcome = await viaEngine('PermissionDenied', [retry(true)], {
        ...FACTS.PermissionDenied,
        reason,
      });
      expect(outcome.effects.retry).toBe(true);
    },
  );

  test('the only output this event reads is retry: JSON fields and a block decision change nothing else', async () => {
    const outcome = await viaEngine('PermissionDenied', [
      { continue: false, systemMessage: 's', decision: 'block', ...retry(true) },
    ]);
    expect(outcome.continue).toBe(true);
    expect(outcome.systemMessages).toEqual([]);
    expect(outcome.block).toBeUndefined();
    expect(outcome.effects).toEqual({ retry: true });
  });

  test('a prompt hook runs on this event, but ok: false has no effect: the denial already happened', async () => {
    const { outcome, models } = await fireModelHook(
      'PermissionDenied',
      promptHook(),
      answer({ ok: false, reason: 'let it through' }),
    );
    expect(models.calls).toHaveLength(1);
    expect(outcome.effects).toEqual({});
    expect(outcome.block).toBeUndefined();
  });
});
