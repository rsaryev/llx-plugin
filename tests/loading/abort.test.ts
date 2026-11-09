/**
 * Judgment (spec/judgments.md, `src/format/abortable-files.ts`): once the signal of `loadPlugin` or
 * `validatePlugin` aborts, the call rejects with the signal's reason and the port is called no more,
 * whether or not the host's port honours the signal itself.
 */
import { describe, expect, test } from 'bun:test';
import { loadPlugin, validatePlugin } from '../../src/loading/index.ts';
import type { PluginFiles } from '../../src/ports/index.ts';
import { memoryFiles } from '../support/ports.ts';

/** What a call rejected with; `undefined` when it resolved. */
const rejectionOf = (call: Promise<unknown>): Promise<unknown> =>
  call.then(
    () => undefined,
    (reason: unknown) => reason,
  );

const TREE = {
  '.claude-plugin/plugin.json': JSON.stringify({ name: 'p' }),
  ...Object.fromEntries(
    Array.from({ length: 20 }, (_, at) => [
      [`skills/s${at}/SKILL.md`, `---\ndescription: s${at}\n---\nDo.`],
      [`commands/c${at}.md`, 'Run.'],
    ]).flat(),
  ),
};

/** A port that ignores the signal, aborts it at its `at`-th call and counts the calls after that. */
function abortingAt(at: number, controller: AbortController) {
  const files = memoryFiles(TREE);
  const seen = { calls: 0, afterAbort: 0 };
  const counted =
    <A extends unknown[], R>(call: (...args: A) => Promise<R>) =>
    (...args: A): Promise<R> => {
      if (controller.signal.aborted) seen.afterAbort++;
      seen.calls++;
      if (seen.calls === at) controller.abort(new Error('stopped by the host'));
      return call(...args);
    };
  const port: PluginFiles = {
    readText: counted((path) => files.readText(path)),
    readBytes: counted((path) => files.readBytes(path)),
    list: counted((path) => files.list(path)),
    stat: counted((path) => files.stat(path)),
    exists: counted((path) => files.exists(path)),
  };
  return { port, seen };
}

describe('judgments: an aborted load stops', () => {
  test('a signal aborted before the call rejects at once and reads nothing', async () => {
    const files = memoryFiles(TREE);
    const reason = new Error('never started');
    expect(await rejectionOf(loadPlugin({ files, signal: AbortSignal.abort(reason) }))).toBe(
      reason,
    );
    expect(await rejectionOf(validatePlugin({ files, signal: AbortSignal.abort(reason) }))).toBe(
      reason,
    );
    expect(files.accesses).toEqual([]);
  });

  for (const [name, run] of [
    ['loadPlugin', (files: PluginFiles, signal: AbortSignal) => loadPlugin({ files, signal })],
    [
      'validatePlugin',
      (files: PluginFiles, signal: AbortSignal) => validatePlugin({ files, signal }),
    ],
  ] as const) {
    test(`${name} aborted mid-way rejects with the reason and calls the port no more`, async () => {
      const controller = new AbortController();
      const { port, seen } = abortingAt(8, controller);
      const reason = await rejectionOf(run(port, controller.signal));
      expect(reason).toBeInstanceOf(Error);
      expect(reason instanceof Error && reason.message).toBe('stopped by the host');
      // Let every branch still pending take its next step: none may reach the port.
      for (let turn = 0; turn < 100; turn++) await Promise.resolve();
      expect(seen.afterAbort).toBe(0);
    });
  }
});
