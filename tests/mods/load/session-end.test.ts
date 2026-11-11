/**
 * `session.end` as the declarations give it: claude-code/index.d.ts:12106 (`SessionEndInput`:
 * `reason`, `sessionId`, "The ending session's id (`$.session.id()` until now)", and `resume`,
 * "What `claude --resume` takes to return to it") and :12612 (`SessionResume`: `id`, "the ending
 * session's own"). spec/judgments.md (`sessionEndResume`). Outside `spec(...)`: the docs give only
 * `e.reason`.
 */
import { describe, expect, test } from 'bun:test';
import { fakePorts } from '../../../src/testing/mods/index.ts';
import { inline, modPlugin, registerOf, session } from '../../support/mods-load.ts';
import { rejection } from '../../support/rejection.ts';

const seen: unknown[] = [];
const observer = registerOf((on) => {
  on('session.end', (_$: unknown, e: unknown, next: (e: unknown) => unknown) => {
    seen.push(e);
    return next(e);
  });
});

describe('ModsHost.endSession', () => {
  test('fires session.end with the reason, the session id and how to resume it', async () => {
    seen.length = 0;
    const ports = fakePorts({
      session: { ...fakePorts().ports.session, id: () => Promise.resolve('s-1') },
    });
    const { host } = session({ watcher: observer }, { ports: ports.ports });
    await host.load([modPlugin(inline('watcher'), observer)]);
    const result = await host.endSession('prompt_input_exit', {
      core: (e) => Promise.resolve({ ended: e }),
    });
    const fired = { reason: 'prompt_input_exit', sessionId: 's-1', resume: { id: 's-1' } };
    expect(seen).toEqual([fired]);
    expect(result).toEqual({ ended: fired });
  });

  test('a session whose id the host cannot give does not end through it', async () => {
    const { host } = session({});
    expect(await rejection(host.endSession('other'))).not.toBeUndefined();
  });
});
