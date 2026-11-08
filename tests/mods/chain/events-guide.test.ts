/**
 * plugins/mods/events.md § How a hook handles an event (Observe, Rewrite, Answer, Filter which
 * events a hook handles), § Filter a `tool.check` hook by whether the call is read-only, § Run
 * alongside other mods (The order mods run in, Where settings hooks run in the order) and
 * plugins/mods/overview.md § What a hook can do with an event. Each test is the docs' own example.
 */
import { describe, expect, test } from 'bun:test';
import { createEventRules } from '../../../src/mods/events/index.ts';
import { withUiRules } from '../../../src/mods/ui/index.ts';
import { fn, harness, type Ev } from '../../support/mods-chain.ts';
import { spec } from '../../support/spec.ts';

const typed = () => harness(undefined, createEventRules());

spec('mods.events.Observe an event', () => {
  test('doing work and returning next(e): the work runs before the tool does, and the tool runs as it would without the mod', async () => {
    const h = typed();
    const trace: string[] = [];
    h.mod(
      'my-mod',
      'user',
      [
        fn('tool.call', async ($, e, next) => {
          // Runs before the tool does; the line the docs show is `my-mod: Claude is about to use Bash`
          await Reflect.apply(Reflect.get($.ui, 'log'), undefined, [
            `Claude is about to use ${String(e.tool)}`,
          ]);
          return next(e);
        }),
      ],
      { 'ui.log': (line) => void trace.push(`log: ${String(line)}`) },
    );
    const result = await h.fire(
      'tool.call',
      { tool: 'Bash', input: { command: 'ls' } },
      {
        core: (e) => {
          trace.push('tool runs');
          return Promise.resolve({ result: e });
        },
      },
    );
    expect(trace).toEqual(['log: Claude is about to use Bash', 'tool runs']);
    expect(result).toEqual({ result: { tool: 'Bash', input: { command: 'ls' } } });
  });

  test('to act after the event: await next(e), do the work, return the result, which Claude reads unchanged', async () => {
    const h = typed();
    const trace: string[] = [];
    h.mod('my-mod', 'user', [
      fn('tool.call', async (_$, e, next) => {
        const result = await next(e);
        trace.push(`${String(e.tool)} finished`);
        return result;
      }),
    ]);
    const bare = harness(undefined, createEventRules());
    const core = (e: unknown) => {
      trace.push('tool runs');
      return Promise.resolve({ result: e });
    };
    const observed = await h.fire('tool.call', { tool: 'Bash', input: {} }, { core });
    const unobserved = await bare.fire('tool.call', { tool: 'Bash', input: {} }, { core });
    expect(trace).toEqual(['tool runs', 'Bash finished', 'tool runs']);
    expect(observed).toEqual(unobserved);
  });
});

spec('mods.events.Rewrite an event', () => {
  const trim = fn('prompt.submit', (_$, e, next) => next({ ...e, text: String(e.text).trim() }));

  test('next with a modified copy: later handlers and Claude Code receive the trimmed prompt and never see the original', async () => {
    const h = typed();
    const later: unknown[] = [];
    h.mod('trimmer', 'user', [trim]);
    h.mod('later', 'user', [fn('prompt.submit', (_$, e, next) => (later.push(e.text), next(e)))]);
    await h.fire('prompt.submit', { text: '  hello  ' });
    expect(later).toEqual(['hello']);
    expect(h.coreSeen).toEqual([{ text: 'hello' }]);
  });

  test('the event is immutable: deeply frozen, and assigning to a field throws', async () => {
    const h = typed();
    const thrown: unknown[] = [];
    h.mod('my-mod', 'user', [
      fn('prompt.submit', (_$, e, next) => {
        try {
          Object.assign(e, { text: 'changed' });
        } catch (error) {
          thrown.push(error instanceof TypeError);
        }
        return next(e);
      }),
    ]);
    await h.fire('prompt.submit', { text: 'hi' });
    expect(thrown).toEqual([true]);
    expect(h.coreSeen).toEqual([{ text: 'hi' }]);
  });

  test('the result can be changed too: await next(e), then return a copy of the result with a field replaced', async () => {
    const h = typed();
    h.mod('my-mod', 'user', [
      fn('tool.call', async (_$, e, next) => {
        const result = await next(e);
        return { ...(result as Ev), result: 'replaced' };
      }),
    ]);
    const result = await h.fire(
      'tool.call',
      { tool: 'Bash', input: {} },
      { core: () => Promise.resolve({ result: 'original' }) },
    );
    expect(result).toEqual({ result: 'replaced' });
  });
});

spec('mods.events.Answer an event', () => {
  const refuse = fn(
    'tool.call',
    () => ({ deny: 'Bash is turned off in this project. Use the file tools.' }),
    {
      matcher: { tool: 'Bash' },
    },
  );

  test('a result without calling next short-circuits the chain: later mods and Claude Code do not run', async () => {
    const h = typed();
    const later: unknown[] = [];
    h.mod('refuser', 'user', [refuse]);
    h.mod('later', 'user', [fn('tool.call', (_$, e, next) => (later.push(e.tool), next(e)))]);
    const result = await h.fire('tool.call', { tool: 'Bash', input: { command: 'rm -rf x' } });
    expect(result).toEqual({ deny: 'Bash is turned off in this project. Use the file tools.' });
    expect(later).toEqual([]);
    expect(h.coreSeen).toEqual([]);
  });

  test('the matcher keeps the answer to Bash: a call to another tool goes on to Claude Code', async () => {
    const h = typed();
    h.mod('refuser', 'user', [refuse]);
    await h.fire('tool.call', { tool: 'Read', input: { file_path: '/x' } });
    expect(h.coreSeen).toEqual([{ tool: 'Read', input: { file_path: '/x' } }]);
  });

  test('each event has its own result shape: a deny that is not text fails the hook, which is skipped', async () => {
    const h = typed();
    h.mod('refuser', 'user', [fn('tool.call', () => ({ deny: 5 }), { matcher: { tool: 'Bash' } })]);
    await h.fire('tool.call', { tool: 'Bash', input: {} });
    expect(h.reports.map((report) => report.line)).toEqual([
      expect.stringMatching(/^refuser: tool\.call hook skipped: returned the wrong shape/),
    ]);
    expect(h.coreSeen).toHaveLength(1);
  });
});

describe('what a hook can do with an event (overview.md)', () => {
  // The overview's `register.js`: `tool.call` observes, `ui.render` rewrites, a command is answered.
  const ui = () => harness(undefined, withUiRules(createEventRules()));
  const spinner = { component: 'Spinner', surface: 'terminal', requestId: 'r1', props: {} };

  spec('mods.overview.What a hook can do with an event.Observe', () => {
    test('the tool.call hook notes what happens and lets it continue unchanged', async () => {
      const h = ui();
      let calls = 0;
      h.mod('first-mod', 'user', [
        fn('tool.call', (_$, e, next) => {
          calls += 1;
          return next(e);
        }),
      ]);
      await h.fire('tool.call', { tool: 'Bash', input: { command: 'ls' } });
      await h.fire('tool.call', { tool: 'Read', input: { file_path: '/x' } });
      expect(calls).toBe(2);
      expect(h.coreSeen).toEqual([
        { tool: 'Bash', input: { command: 'ls' } },
        { tool: 'Read', input: { file_path: '/x' } },
      ]);
    });
  });

  spec('mods.overview.What a hook can do with an event.Rewrite', () => {
    test('the ui.render hook adds the count to the spinner: Claude Code draws with the changed props', async () => {
      const h = ui();
      const calls = 3;
      h.mod('first-mod', 'user', [
        fn(
          'ui.render',
          (_$, e, next) =>
            next({ ...e, props: { ...(e.props as Ev), suffix: ` · tool calls: ${calls}…` } }),
          { matcher: { component: 'Spinner' } },
        ),
      ]);
      await h.fire('ui.render', spinner);
      expect(h.coreSeen).toEqual([{ ...spinner, props: { suffix: ' · tool calls: 3…' } }]);
    });
  });

  spec('mods.overview.What a hook can do with an event.Answer', () => {
    test('the hook handles the event itself, so the usual behavior does not run, such as refusing a command', async () => {
      const h = ui();
      h.mod('first-mod', 'user', [
        fn('command.run', () => ({ text: 'Claude has made 3 tool calls since this mod loaded' }), {
          matcher: { command: 'tally' },
        }),
      ]);
      const result = await h.fire('command.run', { command: 'tally', args: '' });
      expect(result).toEqual({ text: 'Claude has made 3 tool calls since this mod loaded' });
      expect(h.coreSeen).toEqual([]);
      await h.fire('command.run', { command: 'other', args: '' });
      expect(h.coreSeen).toHaveLength(1);
    });
  });
});
