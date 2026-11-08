/**
 * plugins/mods/admin.md § Enforce a policy with a mod of your own: the `acme-guard` example's
 * `tool.call` and `fs.write` hooks write an audit line to the debug log and change nothing. The
 * example's code is registered as written and its hooks are called with a `$` that records `ui.log`.
 */
import { expect, test } from 'bun:test';
import { spec } from '../../support/spec.ts';

type Next = (e: unknown) => Promise<unknown>;
type Hook = ($: Dollar, e: Record<string, unknown>, next: Next) => Promise<unknown>;
interface Dollar {
  ui: { log(text: string, options: { to: string }): void };
}

/** The two audit hooks of the documented example, verbatim apart from types. */
function register(on: (event: string, hook: Hook) => void): void {
  on('tool.call', async ($, e, next) => {
    $.ui.log('audit tool.call ' + String(e['tool']), { to: 'debug' });
    return next(e);
  });
  on('fs.write', async ($, e, next) => {
    const origin = (next as unknown as { origin: { plugin: string } }).origin;
    $.ui.log('audit fs.write by ' + origin.plugin + ' ' + JSON.stringify(e['path']), {
      to: 'debug',
    });
    return next(e);
  });
}

const hooks = new Map<string, Hook>();
register((event, hook) => hooks.set(event, hook));

const logged: { text: string; to: string }[] = [];
const $: Dollar = { ui: { log: (text, options) => logged.push({ text, to: options.to }) } };

const call = async (event: string, e: Record<string, unknown>, plugin = 'reader') => {
  const next = Object.assign(async (value: unknown) => value, { origin: { plugin } });
  const hook = hooks.get(event);
  if (hook === undefined) throw new Error(`no ${event} hook`);
  return { out: await hook($, e, next), event };
};

spec('policy.mods.Enforce a policy with a mod of your own.tool.call', () => {
  test('it writes `audit tool.call Bash` to the debug log and passes the call on unchanged', async () => {
    logged.length = 0;
    const event = { tool: 'Bash', command: 'ls' };
    const { out } = await call('tool.call', event);
    expect(logged).toEqual([{ text: 'audit tool.call Bash', to: 'debug' }]);
    expect(out).toBe(event);
  });
});

spec('policy.mods.Enforce a policy with a mod of your own.fs.write', () => {
  test('it names the mod first and quotes the path, and passes the write on unchanged', async () => {
    logged.length = 0;
    const event = { path: '/tmp/notes.md' };
    const { out } = await call('fs.write', event);
    expect(logged).toEqual([{ text: 'audit fs.write by reader "/tmp/notes.md"', to: 'debug' }]);
    expect(out).toBe(event);
  });

  test('a path a mod picks cannot pass for another audit line', async () => {
    logged.length = 0;
    await call('fs.write', { path: '/x" audit tool.call Bash\naudit fs.write by admin "/y' });
    expect(logged).toHaveLength(1);
    expect(logged[0]?.text.split('\n')).toHaveLength(1);
    expect(logged[0]?.text.startsWith('audit fs.write by reader "')).toBe(true);
  });
});
