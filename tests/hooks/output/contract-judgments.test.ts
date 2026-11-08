/**
 * Judgments of the per-event contracts (spec/judgments.md): where hooks.md is silent the kit decides,
 * and says so. None of these is `spec(...)`: a judgment never counts as compatibility.
 */
import { describe, expect, test } from 'bun:test';
import { resolveDefer, resolveWorktreePath } from '../../../src/hooks/index.ts';
import { fire } from '../../support/hooks-fire.ts';
import { specific, stage, viaEngine } from '../../support/hooks-output.ts';
import { entry, FACTS } from '../../support/hooks-select.ts';

describe('WorktreeCreate: two kinds of hook answer', () => {
  test('an HTTP hook worktreePath wins over what a command hook printed', async () => {
    const hooks = [
      entry('WorktreeCreate'),
      entry('WorktreeCreate', { handler: { type: 'http', url: 'http://wt.test/h' } }),
    ];
    const body = JSON.stringify(specific('WorktreeCreate', { worktreePath: '/from/http' }));
    const { outcome } = await fire('WorktreeCreate', hooks, [{ stdout: '/from/command\n' }], {
      output: stage,
      http: [{ status: 200, body }],
    });
    expect(await resolveWorktreePath(outcome, { ranIn: '/w' })).toEqual({ path: '/from/http' });
  });

  test('the failures name the rejected component and say what was wrong', async () => {
    const run = async (stdout: string, exitCode = 0) =>
      resolveWorktreePath(
        (
          await fire('WorktreeCreate', [entry('WorktreeCreate')], [{ stdout, exitCode }], {
            output: stage,
          })
        ).outcome,
        {
          ranIn: '/w',
          repositoryRoot: '/w',
          isSymlink: (path) => Promise.resolve(path === '/w/link'),
        },
      );
    expect(await run('', 0)).toEqual({
      failure: 'The WorktreeCreate hook returned no worktree path.',
    });
    expect(await run('/x', 1)).toEqual({
      failure: 'The WorktreeCreate hook failed, so no worktree was created.',
    });
    expect(await run('/a/../b')).toEqual({
      failure: 'The worktree path "/a/../b" contains a ".." segment; return a normalized path.',
    });
    expect(await run('/w/link/x')).toEqual({
      failure:
        'The worktree path "/w/link/x" passes through the symlink "link" below the repository root.',
    });
  });
});

describe('a defer that is ignored leaves no hook decision', () => {
  test('the lower-ranked answers of other hooks do not stand in for it', async () => {
    const { outcome } = await fire(
      'PreToolUse',
      [
        entry('PreToolUse'),
        entry('PreToolUse', { handler: { type: 'command', command: './b.sh' } }),
      ],
      [
        { stdout: JSON.stringify(specific('PreToolUse', { permissionDecision: 'defer' })) },
        { stdout: JSON.stringify(specific('PreToolUse', { permissionDecision: 'allow' })) },
      ],
      { output: stage },
    );
    expect(outcome.effects.permissionDecision).toBe('defer');
    const resolved = resolveDefer(outcome.effects, { interactive: true, toolCalls: 1 });
    expect(resolved.kind).toBe('ignored');
    if (resolved.kind === 'ignored') {
      expect(resolved.warning.path).toBe('hooks.PreToolUse.permissionDecision');
      expect(resolved.warning.message).toContain('-p');
    }
  });
});

describe('PermissionDenied retry', () => {
  test('Classifier unavailable is not a no-verdict denial: retry is kept', async () => {
    const outcome = await viaEngine(
      'PermissionDenied',
      [specific('PermissionDenied', { retry: true })],
      {
        ...FACTS.PermissionDenied,
        reason: 'Classifier unavailable',
      },
    );
    expect(outcome.effects.retry).toBe(true);
    expect(outcome.issues).toEqual([]);
  });
});

describe('TaskCompleted continue: false when the host does not say what fired it', () => {
  test('the outcome stops and carries the condition the host applies', async () => {
    const outcome = await viaEngine('TaskCompleted', [{ continue: false, stopReason: 'x' }]);
    expect(outcome.continue).toBe(false);
    expect(outcome.effects.stopCondition).toBe('teammate-finished-its-turn');
  });
});
