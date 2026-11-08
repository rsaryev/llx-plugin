/** plugins/mods/troubleshoot.md § Messages from the built-in guard: one notice per mod per session. */
import { expect, test } from 'bun:test';
import type { ModNotice } from '../../../src/mods/load/index.ts';
import { installed, managed, modPlugin, registerOf, session } from '../../support/mods-load.ts';
import { spec } from '../../support/spec.ts';

spec('mods.troubleshoot.Messages from the built-in guard', () => {
  test('two different approvers each get one notice, never one notice for the whole session', async () => {
    const one = registerOf((on) => {
      on('tool.check', { tool: 'Read' }, () => ({ decision: 'allow' }));
    });
    const two = registerOf((on) => {
      on('tool.check', { tool: 'Bash' }, () => ({ decision: 'allow' }));
    });
    const notices: ModNotice[] = [];
    const s = session(
      { one, two },
      {
        policy: managed(),
        deny: { verdict: () => Promise.resolve('deny') },
        onNotice: (notice) => notices.push(notice),
      },
    );
    await s.host.load([modPlugin(installed('one'), one), modPlugin(installed('two'), two)]);
    for (const tool of ['Read', 'Bash', 'Read', 'Bash']) {
      expect(await s.host.fire('tool.check', { tool, input: {} })).toMatchObject({
        decision: 'deny',
      });
    }
    expect(notices.map((notice) => notice.line)).toEqual([
      'one tried to lift a deny rule in your settings',
      'two tried to lift a deny rule in your settings',
    ]);
  });
});
