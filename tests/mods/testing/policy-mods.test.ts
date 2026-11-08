/**
 * plugins/mods/test.md § Test a policy mod (`tier`, `plugins`, the message of a refused mod).
 */
import { expect, test } from 'bun:test';
import { registerOf, type LooseOn } from '../../support/mods-load.ts';
import { runPluginTests } from '../../support/mods-testing.ts';
import { spec } from '../../support/spec.ts';

const acmeGuard = registerOf((on) => {
  on(
    'plugin.register',
    async (
      _$: unknown,
      e: { tier: string; uses: { calls: string[] } },
      next: (e: unknown) => Promise<unknown>,
    ) => {
      const blocked = e.uses.calls.filter((call) =>
        ['process.run', 'process.spawn'].includes(call),
      );
      if (e.tier === 'user' && blocked.length > 0) {
        return { refuse: 'Acme policy: mods may not call ' + blocked.join(', ') };
      }
      return next(e);
    },
  );
});

const runner = {
  name: 'runner',
  register: registerOf((on) => {
    on('tool.call', async ($: { process: { run(argv: string[]): Promise<unknown> } }) => {
      await $.process.run(['ls']);
      return { result: 'runner answered' };
    });
  }),
};
const reader = {
  name: 'reader',
  register: registerOf((on) => {
    on('tool.call', async () => ({ result: 'reader answered' }));
  }),
};

spec('mods.command.claude plugin test [directory]', () => {
  test('tier("prepend") loads the mod under test ahead of the inline mods, which `plugins` adds: it refuses one that starts a process and admits one that does not', async () => {
    const result = await runPluginTests({
      name: 'acme-guard',
      register: acmeGuard,
      tests: {
        'tests/guard.test.ts': ({ test, tier, expect }) => {
          tier('prepend');
          test('refuses a mod that starts a process', { plugins: [runner] }, async (claude, on) => {
            const $ = claude;
            on('tool.call', () => ({ result: 'claude code answered' }));
            let message = '';
            try {
              await $['tool']?.['call']?.({ tool: 'Bash', command: 'ls' });
            } catch (error) {
              message = (error as Error).message;
            }
            expect(message).toBe(
              'runner: refused by acme-guard: Acme policy: mods may not call process.run',
            );
          });
          test('admits a mod that starts no process', { plugins: [reader] }, async (claude, on) => {
            const $ = claude;
            on('tool.call', () => ({ result: 'claude code answered' }));
            const out = await $['tool']?.['call']?.({ tool: 'Bash', command: 'ls' });
            expect(out).toEqual({ result: 'reader answered' });
          });
        },
      },
    });
    expect(result.lines.join('\n')).toContain('(pass) refuses a mod that starts a process');
    expect(result.lines.join('\n')).toContain('(pass) admits a mod that starts no process');
    expect(result.exitCode).toBe(0);
  });

  test('plugins takes the shape the docs write: a name and register as method shorthand, plain or async', async () => {
    const shorthand = {
      name: 'runner',
      register(this: void, on: LooseOn) {
        on('tool.call', async ($: { process: { run(argv: string[]): Promise<unknown> } }) => {
          await $.process.run(['ls']);
          return { result: 'runner answered' };
        });
      },
    };
    const asynchronous = {
      name: 'later',
      async register(this: void, on: LooseOn) {
        await Promise.resolve();
        on('tool.call', async () => ({ result: 'later answered' }));
      },
    };
    const result = await runPluginTests({
      name: 'acme-guard',
      register: acmeGuard,
      tests: {
        'tests/guard.test.ts': ({ test, tier, expect }) => {
          tier('prepend');
          test(
            'refuses the method-shorthand mod',
            { plugins: [{ ...shorthand, register: registerOf(shorthand.register) }] },
            async (claude, on) => {
              const $ = claude;
              on('tool.call', () => ({ result: 'claude code answered' }));
              let message = '';
              try {
                await $['tool']?.['call']?.({ tool: 'Bash', command: 'ls' });
              } catch (error) {
                message = (error as Error).message;
              }
              expect(message).toBe(
                'runner: refused by acme-guard: Acme policy: mods may not call process.run',
              );
            },
          );
          test(
            'loads the async method-shorthand mod',
            { plugins: [{ ...asynchronous, register: registerOf(asynchronous.register) }] },
            async (claude, on) => {
              const $ = claude;
              on('tool.call', () => ({ result: 'claude code answered' }));
              const out = await $['tool']?.['call']?.({ tool: 'Bash', command: 'ls' });
              expect(out).toEqual({ result: 'later answered' });
            },
          );
        },
      },
    });
    expect(result.lines.join('\n')).toContain('(pass) refuses the method-shorthand mod');
    expect(result.lines.join('\n')).toContain('(pass) loads the async method-shorthand mod');
  });
});
