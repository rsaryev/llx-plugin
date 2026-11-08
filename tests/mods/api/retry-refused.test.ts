/**
 * plugins/mods/api.md § Retry a refused or dropped call (the `submitPrompt` example: "When the result
 * or the error carries one of those strings, `submitPrompt` keeps the text in `pendingText` for the
 * `turn.complete` hook to submit again"; "Any other result or error isn't retried"; "Before the
 * user's next input, `turn.complete` can fire for the interrupted turn itself ... and calls made then
 * are refused again. In that case `submitPrompt` keeps the text for a later `turn.complete`").
 */
import { describe, expect, test } from 'bun:test';
import type { ModsApi } from '../../../src/mods/types.ts';
import { fakePorts } from '../../../src/testing/mods/index.ts';
import { flush } from '../../support/mods-chain.ts';
import { inline, registerOf, session } from '../../support/mods-load.ts';
import { prompting } from '../../support/mods-prompting.ts';
import { memoryFiles } from '../../support/ports.ts';
import { spec } from '../../support/spec.ts';

const STOPPED = 'the session was stopped and nobody has sent input since';
const complete = { turnId: 't-1', answer: '', durationMs: 1, usage: {}, isAborted: false };

/**
 * The module of the page's example, as a file: the scan reads it as it reads any mod (`$` goes to a
 * function declared at the top level, as the page says validation requires), and the runtime runs the
 * same code in this process.
 */
const DOCS_MODULE = `
let pendingText = null

async function submitPrompt($, text) {
  let reason
  try {
    const result = await $.prompt.submit({ text })
    reason = result?.drop ?? ''
  } catch (error) {
    reason = String(error?.message ?? error)
  }
  if (reason.includes('the session was stopped and nobody has sent input since') ||
      reason.includes('was removed from the queue before it ran')) {
    pendingText = text
  }
}

export function register(on) {
  on('turn.complete', async ($, e, next) => {
    if (pendingText !== null) {
      const text = pendingText
      pendingText = null
      submitPrompt($, text)
    }
    return next(e)
  })
}
`;

/** `result?.drop ?? ''` of the page's example. */
const dropOf = (result: unknown): string =>
  typeof result === 'object' &&
  result !== null &&
  'drop' in result &&
  typeof result.drop === 'string'
    ? result.drop
    : '';

describe('Retry a refused or dropped call', () => {
  /** What the page's example keeps: the text of the last refused or dropped prompt, or null. */
  const kept: { text: string | null } = { text: null };

  async function submitPrompt($: ModsApi, text: string): Promise<void> {
    let reason: string;
    try {
      reason = dropOf(await $.prompt.submit({ text }));
    } catch (error) {
      reason = error instanceof Error ? error.message : String(error);
    }
    if (reason.includes(STOPPED) || reason.includes('was removed from the queue before it ran')) {
      kept.text = text;
    }
  }

  async function example(limits: { maxTurns?: number } = {}) {
    kept.text = null;
    const host = prompting();
    const background: { $?: ModsApi } = {};
    const register = registerOf((on) => {
      on('session.start', ($: ModsApi, e: unknown) => {
        background.$ = $;
        return e;
      });
      on('turn.complete', async ($: ModsApi, e: unknown) => {
        if (kept.text !== null) {
          const text = kept.text;
          kept.text = null;
          void submitPrompt($, text);
        }
        return e;
      });
    });
    const plugin = {
      candidate: inline('first-mod'),
      files: memoryFiles({
        '.claude-plugin/plugin.json': JSON.stringify({ name: 'first-mod', version: '0.1.0' }),
        'hooks/hooks.json': JSON.stringify({ modules: ['./register.js'] }),
        'hooks/register.js': DOCS_MODULE,
      }),
    };
    const s = session(
      { 'first-mod': register },
      { ports: fakePorts(host.ports).ports, ...(limits.maxTurns === undefined ? {} : { limits }) },
    );
    const report = await s.host.load([plugin]);
    const job = (text: string) => {
      if (!background.$) throw new Error('session.start did not run');
      return submitPrompt(background.$, text);
    };
    return { s, host, report, job };
  }

  test('the example of the page is a module Claude Code loads', async () => {
    const { report } = await example();
    expect(report.lines).toEqual([]);
    expect(report.loaded.map((mod) => mod.name)).toEqual(['first-mod']);
  });

  spec('mods.apiGuide.Retry a refused or dropped call', () => {
    test('a prompt refused after an interruption is kept; turn.complete before the next input is refused again and keeps it; after the next input it is submitted once', async () => {
      const { s, host, job } = await example();
      s.host.input.interrupt();
      await job('rerun the tests');
      expect(kept.text).toBe('rerun the tests');
      expect(host.submitted).toEqual([]);

      await s.host.fire('turn.complete', complete);
      await flush();
      expect(kept.text).toBe('rerun the tests');
      expect(host.submitted).toEqual([]);

      await s.host.input.userInput();
      await s.host.fire('turn.complete', complete);
      await flush();
      expect(kept.text).toBeNull();
      expect(host.submitted).toEqual([{ text: 'rerun the tests', from: 'first-mod' }]);

      await s.host.fire('turn.complete', complete);
      await flush();
      expect(host.submitted).toHaveLength(1);
    });

    test('a prompt dropped from the queue by the interruption is kept too', async () => {
      const { s, host, job } = await example();
      host.state.holding = true;
      const pending = job('rerun the tests');
      await flush();
      s.host.input.interrupt();
      await pending;
      expect(kept.text).toBe('rerun the tests');
      host.state.holding = false;
      await s.host.input.userInput();
      await s.host.fire('turn.complete', complete);
      await flush();
      expect(host.submitted.map((prompt) => prompt.text)).toEqual([
        'rerun the tests',
        'rerun the tests',
      ]);
    });

    test('any other reason is not retried: a prompt refused at the --max-turns limit is not kept', async () => {
      const { s, host, job } = await example({ maxTurns: 1 });
      host.state.turns = 1;
      await job('rerun the tests');
      expect(kept.text).toBeNull();
      await s.host.fire('turn.complete', complete);
      await flush();
      expect(host.submitted).toEqual([]);
    });
  });
});
