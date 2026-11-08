/**
 * The dispatch wires the stages of `contracts.ts` and nothing else: with a fake of each stage it
 * selects, builds the input, runs every handler with its own input text, reads the runs and
 * hands the merge what each hook said (hooks.md § "How a hook resolves": event, matcher, handler,
 * result). Judgments of the wiring are tested here, outside `spec(...)`.
 */
import { expect, test } from 'bun:test';
import { buildHookInput, createHookRegistry, type TaggedOutput } from '../../src/hooks/index.ts';
import { dispatchEvent, type DispatchStages } from '../../src/hooks/dispatch.ts';
import { entry, FACTS, session } from '../support/hooks-select.ts';
import { fakeOutput } from '../support/hooks-verdict.ts';
import { fakeEnvironment, locations, scriptedRunner } from '../support/ports.ts';

test("the merge receives each hook's output, and a Monitor call's effects flagged as ignored", async () => {
  const hook = entry('PreToolUse', { handler: { type: 'command', command: './a.sh' } });
  const seen: TaggedOutput[] = [];
  const inputs: string[] = [];
  const stages: DispatchStages = {
    select: () => ({
      selected: [hook],
      issues: [],
      monitor: new Map([[hook, { asBash: true, effectsApply: false }]]),
    }),
    build: buildHookInput,
    run: (_entry, context) => {
      inputs.push(context.input);
      return Promise.resolve({
        run: { kind: 'exited', exitCode: 0, stdout: '{"systemMessage":"x"}', stderr: '' },
        issues: [],
      });
    },
    output: {
      parse: fakeOutput.parse,
      merge: (event, outputs) => {
        seen.push(...outputs);
        return fakeOutput.merge(event, outputs);
      },
    },
  };
  const outcome = await dispatchEvent(
    createHookRegistry([hook]),
    {
      event: 'PreToolUse',
      facts: FACTS.PreToolUse,
      session: session(),
      signal: new AbortController().signal,
    },
    {
      stages,
      ports: { runner: scriptedRunner(), locations: locations(), environment: fakeEnvironment() },
      windows: false,
      defaultShell: 'bash',
    },
  );
  expect(JSON.parse(inputs[0] ?? '{}').tool_name).toBe('Bash');
  expect(seen).toHaveLength(1);
  expect(seen[0]?.effectsIgnored).toBe(true);
  expect(outcome.systemMessages).toEqual(['x']);
});
