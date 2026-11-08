/**
 * plugins/mods/interface.md § Keep a value in `$.state` (Define, read, and write a value), § Load a
 * saved value again after `/clear`; plugins/mods/test.md § Test a drawing after `/clear`. Each test is
 * the docs' own example, run through the pane of hello-tabs.
 */
import { expect, test } from 'bun:test';
import { PANE, runHello } from '../../support/mods-hello-pane.ts';
import { spec } from '../../support/spec.ts';

const run = runHello;

spec('mods.interface.Define, read, and write a value', () => {
  test('atom names a value and its default, read returns it, update writes it, and a drawing that read the value is drawn again by the write', async () => {
    const result = await run(({ test, expect }) => {
      test('the pane follows the value', async (claude, on) => {
        const saved = new Map<string, unknown>();
        on('store.get', (_$: unknown, e: { key: string }) => ({ value: saved.get(e.key) }));
        on('store.set', (_$: unknown, e: { key: string; value: unknown }) => {
          saved.set(e.key, e.value);
          return { value: undefined };
        });
        const ui = await claude.ui.mount(PANE);
        expect(await ui.find({ type: 'Text', text: 'Count: 0' })).toBeDefined();
        await ui.press({ key: 'more' });
        await ui.press({ key: 'more' });
        // No `$.ui.invalidate` anywhere in the mod: reading `count` while drawing subscribed the pane to it.
        expect(await ui.find({ type: 'Text', text: 'Count: 2' })).toBeDefined();
      });
    });
    expect(result.lines.join('\n')).toContain('(pass) the pane follows the value');
    expect(result.exitCode).toBe(0);
  });
});

spec('mods.interface.Load a saved value again after /clear', () => {
  test('the test of test.md: after classic.SessionStart with source clear the pane shows the stored count, not 0', async () => {
    const result = await run(({ test, expect }) => {
      test('the saved count comes back after /clear', async (claude, on) => {
        on('store.get', () => ({ value: 7 }));
        on('classic.SessionStart', () => ({}));
        await claude['classic']?.['SessionStart']?.({ source: 'clear' });
        const ui = await claude.ui.mount(PANE);
        expect(await ui.find({ type: 'Text', text: 'Count: 7' })).toBeDefined();
      });
    });
    expect(result.lines.join('\n')).toContain('(pass) the saved count comes back after /clear');
    expect(result.exitCode).toBe(0);
  });

  test('without the classic.SessionStart hook the pane draws Count: 0, and the test fails at toBeDefined', async () => {
    const result = await run(({ test, expect }) => {
      test('the saved count comes back after /clear', async (claude, on) => {
        on('store.get', () => ({ value: 7 }));
        on('classic.SessionStart', () => ({}));
        await claude['classic']?.['SessionStart']?.({ source: 'clear' });
        const ui = await claude.ui.mount(PANE);
        expect(await ui.find({ type: 'Text', text: 'Count: 7' })).toBeDefined();
        expect(await ui.find({ type: 'Text', text: 'Count: 0' })).toBeUndefined();
      });
    }, false);
    expect(result.failed).toBe(1);
  });

  test('resume and fork load it again too; startup and compact do not, which the source filter keeps to the three resets', async () => {
    const result = await run(({ test, expect }) => {
      for (const [source, shown] of [
        ['resume', 'Count: 7'],
        ['fork', 'Count: 7'],
        ['startup', 'Count: 0'],
        ['compact', 'Count: 0'],
      ] as const) {
        test(`source ${source}`, async (claude, on) => {
          on('store.get', () => ({ value: 7 }));
          on('classic.SessionStart', () => ({}));
          await claude['classic']?.['SessionStart']?.({ source });
          const ui = await claude.ui.mount(PANE);
          expect(await ui.find({ type: 'Text', text: shown })).toBeDefined();
        });
      }
    });
    expect(result.passed).toBe(4);
    expect(result.failed).toBe(0);
  });

  test('a button that saves the $.state value writes the default over the stored count when nothing loaded it again', async () => {
    const saved = new Map<string, unknown>([['count', 7]]);
    const result = await run(({ test, expect }) => {
      test('the store keeps its 7', async (claude, on) => {
        on('store.get', (_$: unknown, e: { key: string }) => ({ value: saved.get(e.key) }));
        on('store.set', (_$: unknown, e: { key: string; value: unknown }) => {
          saved.set(e.key, e.value);
          return { value: undefined };
        });
        const ui = await claude.ui.mount(PANE);
        await ui.press({ key: 'more' });
        expect(saved.get('count')).toBe(7);
      });
    }, false);
    expect(result.failed).toBe(1);
    expect(saved.get('count')).toBe(1);
  });
});
