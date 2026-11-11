/**
 * The `prompt` and `agent` handlers: hooks.md § "Prompt and agent hook fields" (`prompt`: "Use
 * `$ARGUMENTS` as a placeholder for the hook input JSON. Escape with a backslash to include literal
 * text: `\$1.00` renders as `$1.00`"; `model`: "Model to use for evaluation. Defaults to the model
 * Claude Code uses for background functionality"), § "Prompt hook configuration" ("If `$ARGUMENTS`
 * is not present, input JSON is appended to the prompt"; timeout 30), § "Response schema" (`ok`,
 * `reason` "required when `ok` is `false`", `impossible` "Agent hooks and other events ignore it")
 * and § "Agent hook configuration" ("the same as prompt hooks, except ... a longer default timeout
 * of 60 seconds and no `continueOnBlock` field"). The two fields are the same on both types, so an
 * agent hook is proven under the same ids. Rows outside `spec(...)` are judgments (spec/judgments.md).
 */
import { describe, expect, test } from 'bun:test';
import { runHandler } from '../../../../src/hooks/handlers/index.ts';
import { composePrompt } from '../../../../src/hooks/handlers/remote/prompt-text.ts';
import { AGENT_HOOK_TOOLS } from '../../../../src/hooks/handlers/remote/agent.ts';
import { agentEntry, promptEntry, remoteContext } from '../../../support/hooks-remote.ts';
import type { ModelReply } from '../../../support/ports.ts';
import { fakeModel } from '../../../support/ports.ts';
import { spec } from '../../../support/spec.ts';

const INPUT = '{"hook_event_name":"Stop","stop_hook_active":false}';

type Kind = 'prompt' | 'agent';

const ENTRY = { prompt: promptEntry, agent: agentEntry } as const satisfies Record<Kind, unknown>;

const run = async (
  type: Kind,
  hook: { prompt: string; model?: string; timeout?: number },
  reply: ModelReply = { text: '{"ok":true}' },
  input = INPUT,
) => {
  const models = fakeModel(reply);
  const result = await runHandler(ENTRY[type](hook, 'Stop'), remoteContext({ models, input }));
  return { call: models.calls[0], result };
};

const TYPES: readonly Kind[] = ['prompt', 'agent'];

spec(
  [
    'hooks.handler.prompt.prompt',
    'hooks.behavior.Prompt hook configuration.prompt',
    'hooks.behavior.Prompt hook configuration.type',
    'hooks.behavior.Prompt-based hooks',
    'hooks.guide.Prompt-based hooks',
  ],
  () => {
    test('the docs example: $ARGUMENTS becomes the hook input JSON', () => {
      expect(
        composePrompt(
          'Evaluate if Claude should stop: $ARGUMENTS. Check if all tasks are complete.',
          INPUT,
        ),
      ).toBe(`Evaluate if Claude should stop: ${INPUT}. Check if all tasks are complete.`);
    });

    test('every $ARGUMENTS is replaced', () => {
      expect(composePrompt('a $ARGUMENTS b $ARGUMENTS', '{}')).toBe('a {} b {}');
    });

    test('a backslash escapes: \\$1.00 renders as $1.00', () => {
      expect(composePrompt('Spend at most \\$1.00. $ARGUMENTS', '{}')).toBe(
        'Spend at most $1.00. {}',
      );
    });

    test('an escaped \\$ARGUMENTS is literal text, not the placeholder, so the input is appended', () => {
      expect(composePrompt('Write \\$ARGUMENTS literally', '{"a":1}')).toBe(
        'Write $ARGUMENTS literally\n\n{"a":1}',
      );
    });

    test('without $ARGUMENTS the input JSON is appended to the prompt', () => {
      const prompt = 'Block any Bash command that reads `.env` files';
      expect(composePrompt(prompt, INPUT)).toBe(`${prompt}\n\n${INPUT}`);
    });

    test('the input is inserted as it is: a $ARGUMENTS or \\$ inside it is not read again', () => {
      const tricky = '{"cmd":"echo $ARGUMENTS \\\\$HOME"}';
      expect(composePrompt('check $ARGUMENTS', tricky)).toBe(`check ${tricky}`);
    });

    for (const type of TYPES) {
      test(`a ${type} hook sends the composed prompt to the model, which also gets the response schema`, async () => {
        const { call } = await run(type, { prompt: 'Is it done? $ARGUMENTS' });
        expect(call?.prompt.startsWith(`Is it done? ${INPUT}\n\n`)).toBe(true);
        expect(call?.prompt).toContain('"ok"');
        expect(call?.prompt).toContain('"reason"');
      });
    }
  },
);

spec(['hooks.handler.prompt.model'], () => {
  for (const type of TYPES) {
    test(`a ${type} hook names its model to the port`, async () => {
      const { call } = await run(type, { prompt: 'p', model: 'claude-haiku-4-5' });
      expect(call?.model).toBe('claude-haiku-4-5');
    });

    test(`a ${type} hook with no model leaves the choice to the host (its background model)`, async () => {
      const { call } = await run(type, { prompt: 'p' });
      expect(call !== undefined && 'model' in call).toBe(false);
    });
  }
});

describe('timeouts and tools', () => {
  test('a prompt hook waits 30 s by default, an agent hook 60 s, a set timeout wins', async () => {
    expect((await run('prompt', { prompt: 'p' })).call?.timeoutMs).toBe(30_000);
    expect((await run('agent', { prompt: 'p' })).call?.timeoutMs).toBe(60_000);
    expect((await run('agent', { prompt: 'p', timeout: 120 })).call?.timeoutMs).toBe(120_000);
  });

  test('a prompt hook is one turn with no tools; an agent hook gets the investigation tools', async () => {
    const prompt = await run('prompt', { prompt: 'p' });
    expect(prompt.call !== undefined && 'tools' in prompt.call).toBe(false);
    const agent = await run('agent', { prompt: 'p' });
    expect(agent.call?.tools).toEqual(AGENT_HOOK_TOOLS);
    expect(AGENT_HOOK_TOOLS).toEqual(['Read', 'Grep', 'Glob']);
  });
});

describe('the response schema', () => {
  test('{"ok": true} allows', async () => {
    expect((await run('prompt', { prompt: 'p' }, { text: '{"ok": true}' })).result.run).toEqual({
      kind: 'model',
      ok: true,
    });
  });

  test('{"ok": false, "reason": ...} blocks with the reason', async () => {
    const { result } = await run(
      'prompt',
      { prompt: 'p' },
      { text: '{"ok":false,"reason":"tests fail"}' },
    );
    expect(result.run).toEqual({ kind: 'model', ok: false, reason: 'tests fail' });
  });

  test('a prompt hook reads impossible, an agent hook ignores it', async () => {
    const text = '{"ok":false,"reason":"never","impossible":true}';
    expect((await run('prompt', { prompt: 'p' }, { text })).result.run).toEqual({
      kind: 'model',
      ok: false,
      reason: 'never',
      impossible: true,
    });
    expect((await run('agent', { prompt: 'p' }, { text })).result.run).toEqual({
      kind: 'model',
      ok: false,
      reason: 'never',
    });
  });

  test('only a prompt hook is told about impossible', async () => {
    expect((await run('prompt', { prompt: 'p' })).call?.prompt).toContain('impossible');
    expect((await run('agent', { prompt: 'p' })).call?.prompt).not.toContain('impossible');
  });

  for (const type of TYPES) {
    test(`ok: false without the required reason is no verdict, for a ${type} hook`, async () => {
      for (const text of ['{"ok":false}', '{"ok":false,"reason":"  "}']) {
        expect((await run(type, { prompt: 'p' }, { text })).result.run.kind).toBe('model-failed');
      }
    });

    test(`a reply that is not the schema is no verdict for a ${type} hook: prose, a wrong type, an array, empty`, async () => {
      for (const text of [
        'Sure, all good.',
        '{"ok":"yes"}',
        '{"allow":true}',
        '[true]',
        '',
        '{"ok":true',
      ]) {
        expect((await run(type, { prompt: 'p' }, { text })).result.run.kind).toBe('model-failed');
      }
    });
  }

  test('a reply in one code fence is read as the JSON inside', async () => {
    const { result } = await run('prompt', { prompt: 'p' }, { text: '```json\n{"ok":true}\n```' });
    expect(result.run).toEqual({ kind: 'model', ok: true });
  });

  test('a model that failed is a non-blocking failure; a timeout and an abort are the shared runs', async () => {
    const failed = await run(
      'prompt',
      { prompt: 'p' },
      { failure: 'model', message: 'overloaded' },
    );
    expect(failed.result.run).toEqual({ kind: 'model-failed', message: 'overloaded' });
    const slow = await run('agent', { prompt: 'p' }, { failure: 'timeout', message: 'late' });
    expect(slow.result.run).toEqual({ kind: 'timed-out' });
    const stopped = await run('prompt', { prompt: 'p' }, { failure: 'aborted', message: 'x' });
    expect(stopped.result.run).toEqual({ kind: 'cancelled' });
  });

  test('without the model port the hook does not run and says why', async () => {
    for (const type of TYPES) {
      const result = await runHandler(ENTRY[type]({ prompt: 'p' }, 'Stop'), remoteContext({}));
      expect(result.run.kind).toBe('skipped');
      expect(result.issues[0]?.severity).toBe('error');
    }
  });
});
