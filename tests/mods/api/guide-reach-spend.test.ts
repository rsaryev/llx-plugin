/**
 * plugins/mods/overview.md § What a mod can reach, the last two bullets: "act without asking you" and
 * "spend your usage". Each is a call or a hook answered by the ports the host gave, with nothing
 * between the mod and the port that asks the user.
 */
import { expect, test } from 'bun:test';
import { fakePorts } from '../../../src/testing/mods/index.ts';
import { withUiRules } from '../../../src/mods/ui/index.ts';
import { apiHarness, memoryStore, modelUsage } from '../../support/mods-api.ts';
import { installed, modPlugin, registerOf, session } from '../../support/mods-load.ts';
import { fakeInterface, uiOver } from '../../support/mods-ui.ts';
import { spec } from '../../support/spec.ts';

/** A session with `register` loaded as the mod `my-mod`; the scan reads the module's text, so `on` is called in `register` itself. */
async function loaded(register: ReturnType<typeof registerOf>) {
  const { host } = session({ 'my-mod': register }, { firesSessionStart: false });
  await host.load([modPlugin(installed('my-mod'), register)]);
  return host;
}

spec('mods.overview.What a mod can reach.Act without asking you', () => {
  test('a tool.check hook answers allow: the decision is made before Claude Code asks you', async () => {
    const host = await loaded(
      registerOf((on) => {
        on('tool.check', async () => ({ decision: 'allow' }));
      }),
    );
    let asked = false;
    const answer = await host.fire(
      'tool.check',
      { tool: 'Bash', input: { command: 'rm -rf build' } },
      {
        core: () => {
          asked = true;
          return Promise.resolve({ decision: 'ask' });
        },
      },
    );
    expect(answer).toEqual({ decision: 'allow' });
    expect(asked).toBe(false);
  });

  test('without such a hook the decision is Claude Code own: you are asked', async () => {
    const host = await loaded(registerOf(() => undefined));
    const answer = await host.fire(
      'tool.check',
      { tool: 'Bash', input: { command: 'rm -rf build' } },
      { core: () => Promise.resolve({ decision: 'ask' }) },
    );
    expect(answer).toEqual({ decision: 'ask' });
  });
});

spec('mods.overview.What a mod can reach.Spend your usage', () => {
  test('$.model.complete sends the request through the session credentials with no question to you, and reports what it used', async () => {
    const calls: unknown[] = [];
    const questions: string[] = [];
    const { iface } = fakeInterface({
      ask: (...args) => (questions.push(`ask ${JSON.stringify(args)}`), Promise.resolve('Run it')),
    });
    const h = await apiHarness({
      rules: withUiRules,
      ui: uiOver(iface),
      ports: {
        models: {
          complete: (call: unknown) => (
            calls.push(call),
            Promise.resolve({ isAnswered: true as const, text: 'done', usage: modelUsage })
          ),
          fork: () => Promise.reject(new Error('unused')),
          classify: () => Promise.reject(new Error('unused')),
        },
        tools: {
          call: () => (questions.push('tools.call'), Promise.reject(new Error('unused'))),
          check: () => (questions.push('tools.check'), Promise.reject(new Error('unused'))),
        },
        session: {
          ...fakePorts().ports.session,
          authorize: () => (
            questions.push('session.authorize'),
            Promise.reject(new Error('unused'))
          ),
        },
        store: memoryStore(),
      },
    });
    const answer = await h.api.model.complete({
      model: 'opus',
      prompt: 'summarize the repo',
      maxTokens: 4000,
    });
    expect(answer).toEqual({ isAnswered: true, text: 'done', usage: modelUsage });
    expect(calls).toHaveLength(1);
    // Neither the interface's question, a permission check nor an authorization was reached.
    expect(questions).toEqual([]);
  });
});
