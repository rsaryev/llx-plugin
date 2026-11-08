/**
 * hooks.md § "Decision control", second half: PreModelSwitch, PermissionRequest, PermissionDenied,
 * WorktreeCreate and WorktreeRemove, the elicitations, MessageDisplay, the context-only events, the
 * events with no decision control, and the list of events that rewrite content.
 */
import { describe, expect, test } from 'bun:test';
import type { HookEvent } from '../../../src/protocol/official.ts';
import { fire } from '../../support/hooks-fire.ts';
import { specific, stage, viaEngine } from '../../support/hooks-output.ts';
import { entry, FACTS } from '../../support/hooks-select.ts';
import { spec } from '../../support/spec.ts';

const exits = (event: HookEvent, exitCode: number, stderr: string, facts?: object) =>
  fire(event, [entry(event)], [{ exitCode, stderr }], {
    output: stage,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the facts are the event's own
    ...(facts === undefined ? {} : { facts: facts as never }),
  }).then(({ outcome }) => outcome);

spec('hooks.behavior.Decision control', () => {
  describe('PreModelSwitch: hookSpecificOutput or top-level decision', () => {
    test.each(['allow', 'deny', 'ask'] as const)(
      'permissionDecision %s reaches the host',
      async (decision) => {
        const outcome = await viaEngine('PreModelSwitch', [
          specific('PreModelSwitch', {
            permissionDecision: decision,
            permissionDecisionReason: 'why',
          }),
        ]);
        expect(outcome.effects.permissionDecision).toBe(decision);
      },
    );

    test('decision: block also cancels the switch', async () => {
      const outcome = await viaEngine('PreModelSwitch', [{ decision: 'block', reason: 'costly' }]);
      expect(outcome.proceed).toBe(false);
      expect(outcome.effects.permissionDecision).toBe('deny');
    });
  });

  describe('PermissionRequest: hookSpecificOutput decision.behavior', () => {
    test('the docs example, allow with updatedInput', async () => {
      const outcome = await viaEngine('PermissionRequest', [
        specific('PermissionRequest', {
          decision: { behavior: 'allow', updatedInput: { command: 'npm run lint' } },
        }),
      ]);
      expect(outcome.effects.permissionRequest).toEqual({
        behavior: 'allow',
        updatedInput: { command: 'npm run lint' },
      });
    });

    test('deny denies the request', async () => {
      const outcome = await viaEngine('PermissionRequest', [
        specific('PermissionRequest', { decision: { behavior: 'deny', message: 'No network' } }),
      ]);
      expect(outcome.effects.permissionRequest).toEqual({
        behavior: 'deny',
        message: 'No network',
      });
      expect(outcome.proceed).toBe(false);
    });

    test('a top-level decision is not the pattern: PermissionRequest discards it', async () => {
      expect((await viaEngine('PermissionRequest', [{ decision: 'block' }])).proceed).toBe(true);
    });
  });

  describe('PermissionDenied: hookSpecificOutput.retry', () => {
    test('retry: true tells the model it may retry the denied call', async () => {
      const outcome = await viaEngine('PermissionDenied', [
        specific('PermissionDenied', { retry: true }),
      ]);
      expect(outcome.effects.retry).toBe(true);
    });

    test('no JSON, or retry: false, leaves the denial standing', async () => {
      expect((await viaEngine('PermissionDenied', [''])).effects.retry).toBeUndefined();
      expect(
        (await viaEngine('PermissionDenied', [specific('PermissionDenied', { retry: false })]))
          .effects.retry,
      ).toBeUndefined();
    });
  });

  describe('WorktreeCreate and WorktreeRemove: a path return and an exit code', () => {
    test('an HTTP WorktreeCreate hook returns hookSpecificOutput.worktreePath', async () => {
      const hook = entry('WorktreeCreate', {
        handler: { type: 'http', url: 'http://wt.test/create' },
      });
      const body = JSON.stringify(specific('WorktreeCreate', { worktreePath: '/abs/wt' }));
      const { outcome } = await fire('WorktreeCreate', [hook], [], {
        output: stage,
        http: [{ status: 200, body }],
      });
      expect(outcome.effects.worktreePath).toBe('/abs/wt');
    });

    test('a failing WorktreeCreate hook fails creation', async () => {
      expect((await exits('WorktreeCreate', 1, 'svn failed')).proceed).toBe(false);
    });

    test('any non-zero exit code makes WorktreeRemove fail if the directory still exists afterward', async () => {
      for (const code of [1, 2, 127]) {
        const outcome = await exits('WorktreeRemove', code, 'cannot remove');
        expect(outcome.proceed).toBe(false);
        expect(outcome.block?.condition).toBe('worktree-directory-remains');
      }
      expect((await exits('WorktreeRemove', 0, '')).proceed).toBe(true);
    });

    test('WorktreeRemove JSON output is discarded', async () => {
      const outcome = await viaEngine('WorktreeRemove', [
        { decision: 'block', reason: 'x', systemMessage: 'y', continue: false },
      ]);
      expect(outcome.proceed).toBe(true);
      expect(outcome.continue).toBe(true);
      expect(outcome.systemMessages).toEqual([]);
    });
  });

  describe('Elicitation, ElicitationResult: hookSpecificOutput or top-level decision', () => {
    test.each(['Elicitation', 'ElicitationResult'] as const)(
      '%s: action accept with content reaches the server, and decision block also declines',
      async (event) => {
        const accepted = await viaEngine(event, [
          specific(event, { action: 'accept', content: { username: 'alice' } }),
        ]);
        expect(accepted.effects.elicitation).toEqual({
          action: 'accept',
          content: { username: 'alice' },
        });
        const blocked = await viaEngine(event, [{ decision: 'block' }]);
        expect(blocked.effects.elicitation).toEqual({ action: 'decline' });
      },
    );
  });

  describe('MessageDisplay: hookSpecificOutput.displayContent', () => {
    test('displayContent replaces the displayed text', async () => {
      const outcome = await viaEngine('MessageDisplay', [
        specific('MessageDisplay', { displayContent: 'redacted' }),
      ]);
      expect(outcome.effects.displayContent).toBe('redacted');
    });
  });

  describe('SessionStart, SubagentStart, PostModelSwitch: context only', () => {
    test.each(['SessionStart', 'SubagentStart', 'PostModelSwitch'] as const)(
      '%s: additionalContext adds context, and there is no blocking or decision control',
      async (event) => {
        const outcome = await viaEngine(event, [
          {
            decision: 'block',
            reason: 'no',
            ...specific(event, { additionalContext: 'The branch is main' }),
          },
        ]);
        expect(outcome.additionalContext).toEqual(['The branch is main']);
        expect(outcome.proceed).toBe(true);
        expect(outcome.block).toBeUndefined();
      },
    );
  });

  describe('Setup, Notification, SessionEnd, PostCompact, InstructionsLoaded, StopFailure, CwdChanged, DirectoryAdded, FileChanged: none', () => {
    test.each([
      'Setup',
      'Notification',
      'SessionEnd',
      'PostCompact',
      'InstructionsLoaded',
      'StopFailure',
      'CwdChanged',
      'DirectoryAdded',
      'FileChanged',
    ] as const)('%s: a block decision is discarded and the event goes on', async (event) => {
      const outcome = await viaEngine(event, [{ decision: 'block', reason: 'stop it' }]);
      expect(outcome.proceed).toBe(true);
      expect(outcome.block).toBeUndefined();
    });

    test.each(['Setup', 'SessionEnd', 'InstructionsLoaded'] as const)(
      '%s: exit code 2 blocks nothing',
      async (event) => {
        expect((await exits(event, 2, 'no')).proceed).toBe(true);
      },
    );
  });

  describe('events that rewrite content', () => {
    test('PreToolUse: updatedInput under hookSpecificOutput replaces the tool arguments', async () => {
      const outcome = await viaEngine('PreToolUse', [
        specific('PreToolUse', { permissionDecision: 'allow', updatedInput: { command: 'ls' } }),
      ]);
      expect(outcome.effects.updatedInput).toEqual({ command: 'ls' });
    });

    test('PermissionRequest: updatedInput inside the decision object', async () => {
      const outcome = await viaEngine('PermissionRequest', [
        specific('PermissionRequest', {
          decision: { behavior: 'allow', updatedInput: { command: 'ls' } },
        }),
      ]);
      expect(outcome.effects.permissionRequest).toMatchObject({ updatedInput: { command: 'ls' } });
      expect(outcome.effects.updatedInput).toBeUndefined();
    });

    test('PostToolUse: updatedToolOutput replaces the result Claude sees', async () => {
      const replacement = { stdout: '[redacted]', stderr: '', interrupted: false, isImage: false };
      const outcome = await viaEngine(
        'PostToolUse',
        [specific('PostToolUse', { updatedToolOutput: replacement })],
        { ...FACTS.PostToolUse, tool_name: 'Bash', tool_input: { command: 'cat .env' } },
      );
      expect(outcome.effects.updatedToolOutput).toEqual(replacement);
    });

    test("UserPromptSubmit can't replace the prompt: it only injects additionalContext alongside it", async () => {
      const outcome = await viaEngine('UserPromptSubmit', [
        specific('UserPromptSubmit', {
          additionalContext: 'Today is Monday',
          updatedPrompt: 'something else',
          prompt: 'something else',
        }),
      ]);
      expect(outcome.additionalContext).toEqual(['Today is Monday']);
      expect(JSON.stringify(outcome.effects)).not.toContain('something else');
    });
  });
});
