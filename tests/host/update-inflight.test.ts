/**
 * An update that lands while a dispatch is in flight (hooks.md, "Hooks in skills and agents":
 * `once: true` removes a hook after its first successful run): the dispatch drops the `once` hooks
 * it consumed from the registry as it is now, rebuilt by the update, so the consumed hook stays
 * gone and the new plugin's hooks are there. Integration test of the host, outside `spec()`; what
 * survives an update is a row in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import { hostOf, SESSION, signal } from '../support/host.ts';
import { commandsRun, hostPlugin, pluginOf, skillText } from '../support/update.ts';

const GUARDED = 'guarded@acme';
const NEWCOMER = 'newcomer@acme';

const ONCE = [
  'hooks:',
  '  PostToolUse:',
  '    - hooks:',
  '        - type: command',
  '          command: /bin/audit-once',
  '          once: true',
];

const done = {
  tool_name: 'Bash',
  tool_input: { command: 'ls' },
  tool_use_id: 't1',
  tool_response: {},
  duration_ms: 1,
};

const guarded = () => pluginOf('guarded', { skills: { audit: skillText('Audit', ONCE) } });

describe('host.update during an in-flight dispatch', () => {
  test('the once hook it consumed stays consumed and the new plugin hooks are present', async () => {
    const { host, runner } = await hostOf({
      plugins: [hostPlugin(GUARDED, await guarded())],
      runs: [{}, {}, {}],
    });
    const session = host.openSession(SESSION);
    await session.expandSkill('guarded:audit', { signal: signal() });
    const gate = Promise.withResolvers<void>();
    const run = runner.run.bind(runner);
    let first = true;
    Object.assign(runner, {
      run: async (spec: Parameters<typeof run>[0]) => {
        if (first) {
          first = false;
          await gate.promise;
        }
        return run(spec);
      },
    });
    const inFlight = session.dispatch('PostToolUse', done, { signal: signal() });
    const newcomer = await pluginOf('newcomer', {
      hooks: { PostToolUse: [{ hooks: [{ type: 'command', command: '/bin/new-post' }] }] },
    });
    host.update({
      plugins: [hostPlugin(GUARDED, await guarded()), hostPlugin(NEWCOMER, newcomer)],
    });
    gate.resolve();
    await inFlight;
    await session.dispatch('PostToolUse', done, { signal: signal() });
    expect(commandsRun(runner)).toEqual(['/bin/audit-once', '/bin/new-post']);
  });
});
