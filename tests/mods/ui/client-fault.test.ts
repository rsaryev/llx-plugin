/**
 * plugins/mods/troubleshoot.md § `the module failed without a message` (and interface.md § When a
 * `Client` fails): a `Client` whose error has no message, such as `throw new Error()`, shows the
 * reason `the module failed without a message`, where releases before v2.1.289 showed `Error`.
 */
import { expect, test } from 'bun:test';
import { clientFailureLine } from '../../../src/mods/ui/index.ts';
import { inline, modPlugin, registerOf, session } from '../../support/mods-load.ts';
import { spec } from '../../support/spec.ts';

spec('mods.troubleshoot.the module failed without a message', () => {
  test('the line of a Client whose error has no message, such as `throw new Error()`, gives the documented reason', () => {
    expect(clientFailureLine('my-mod', 'client/spinner.js', new Error().message)).toBe(
      'my-mod: Client client/spinner.js: the module failed without a message',
    );
    expect(clientFailureLine('my-mod', 'client/spinner.js', undefined)).toBe(
      'my-mod: Client client/spinner.js: the module failed without a message',
    );
  });

  test('an error with a message shows that message, as `boom` does in interface.md', () => {
    expect(clientFailureLine('my-mod', 'client/spinner.js', 'boom')).toBe(
      'my-mod: Client client/spinner.js: boom',
    );
  });

  test('the ui.fault hooks of the mod see the same reason, not `Error`', async () => {
    const seen: unknown[] = [];
    const register = registerOf((on) => {
      on('ui.fault', (_$: unknown, e: { reason?: unknown }) => {
        seen.push(e.reason);
        return e;
      });
    });
    const { host } = session({ 'my-mod': register });
    await host.load([modPlugin(inline('my-mod'), register)]);
    await host.ui.fault('my-mod', { phase: 'run', reason: '' });
    await host.ui.fault('my-mod', { phase: 'run', reason: 'boom' });
    expect(seen).toEqual(['the module failed without a message', 'boom']);
  });
});
