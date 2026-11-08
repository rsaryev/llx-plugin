/**
 * plugins/mods/events.md § Run alongside other mods, "Where settings hooks run in the order": the
 * `PreToolUse` hooks of managed settings run before the first mod's `tool.call` hook, and those of
 * every other settings file and of plugins' `hooks/hooks.json` run after the last mod calls `next`,
 * as part of Claude Code's own behaviour. A host composes the two halves; here the test host does it
 * with the kit's hook engine over a runner that records each command, and fires through
 * `createModsHost(...).fire` with `before` and `core`.
 */
import { expect, test } from 'bun:test';
import { createHookEngine, createHookRegistry } from '../../../src/hooks/index.ts';
import type { RegisteredHandler } from '../../../src/hooks/index.ts';
import type { CommandRunner } from '../../../src/ports/index.ts';
import type { ModsApi } from '../../../src/mods/types.ts';
import {
  entry,
  FACTS,
  managedSettings,
  pluginSource,
  session as hookSession,
  settingsSource,
} from '../../support/hooks-select.ts';
import { installed, modPlugin, registerOf, session } from '../../support/mods-load.ts';
import { fakeEnvironment, locations } from '../../support/ports.ts';
import { spec } from '../../support/spec.ts';

type Next = (e: unknown) => Promise<unknown>;

/** A `PreToolUse` command hook, by the name of its command, from a source. */
const hookOf = (command: string, source: RegisteredHandler['source']): RegisteredHandler =>
  entry('PreToolUse', {
    source,
    handler: { type: 'command', command },
    ...(source.pluginName === undefined ? {} : { pluginId: `${source.pluginName}@acme-tools` }),
  });

const MANAGED = hookOf('managed.sh', managedSettings);
const OTHER = hookOf('settings.sh', settingsSource);
const PLUGIN = hookOf('plugin.sh', pluginSource('formatter'));

/** What the test host does with `PreToolUse` hooks: one trace for the commands that run and the mods that are reached. */
function compose(trace: string[], blocking: readonly string[] = []) {
  const commands: CommandRunner = {
    run: ({ spec: ran }) => {
      trace.push(ran.command);
      const exitCode = blocking.includes(ran.command) ? 2 : 0;
      const stderr = exitCode === 2 ? `${ran.command} says no` : '';
      return Promise.resolve({ exitCode, stdout: '', stderr, timedOut: false });
    },
  };
  const engine = createHookEngine({
    commands,
    locations: locations(),
    environment: fakeEnvironment(),
  });
  const run = async (entries: readonly RegisteredHandler[]): Promise<unknown> => {
    const outcome = await engine.dispatch(createHookRegistry(entries), {
      event: 'PreToolUse',
      facts: FACTS.PreToolUse,
      session: hookSession(),
      signal: new AbortController().signal,
    });
    return outcome.proceed ? undefined : { deny: outcome.block?.reason };
  };
  const all = [MANAGED, OTHER, PLUGIN];
  return {
    before: () => run(all.filter((one) => one.source.managed === true)),
    core: () => run(all.filter((one) => one.source.managed !== true)),
  };
}

/** A hooks module whose `tool.call` hook notes when it is reached and what comes back. */
const modAt = (trace: string[], label: string, answer?: unknown) =>
  registerOf((on) => {
    on('tool.call', async (_$: ModsApi, e: unknown, next: Next) => {
      trace.push(label);
      if (answer !== undefined) return answer;
      const result = await next(e);
      trace.push(`${label} sees ${JSON.stringify(result)}`);
      return result;
    });
  });

async function hostWith(registers: Record<string, ReturnType<typeof modAt>>) {
  const { host } = session(registers, { firesSessionStart: false });
  await host.load(
    Object.entries(registers).map(([name, register]) => modPlugin(installed(name), register)),
  );
  return host;
}

const CALL = { tool: 'Bash', input: { command: 'ls' } };

spec('mods.events.Where settings hooks run in the order', () => {
  test('managed hooks run before the first mod, the others (settings files and plugins) after the last mod calls next, and a mod that calls next sees their decision', async () => {
    const trace: string[] = [];
    const host = await hostWith({
      first: modAt(trace, 'first mod'),
      last: modAt(trace, 'last mod'),
    });
    const settings = compose(trace, ['plugin.sh']);
    const result = await host.fire('tool.call', CALL, settings);
    expect(trace).toEqual([
      'managed.sh',
      'first mod',
      'last mod',
      'settings.sh',
      'plugin.sh',
      'last mod sees {"deny":"plugin.sh says no"}',
      'first mod sees {"deny":"plugin.sh says no"}',
    ]);
    expect(result).toEqual({ deny: 'plugin.sh says no' });
  });

  test('when a managed hook blocks the call, no mod hook runs for it, and neither do the other settings hooks', async () => {
    const trace: string[] = [];
    const host = await hostWith({ first: modAt(trace, 'first mod') });
    const result = await host.fire('tool.call', CALL, compose(trace, ['managed.sh']));
    expect(result).toEqual({ deny: 'managed.sh says no' });
    expect(trace).toEqual(['managed.sh']);
  });

  test('a mod that answers tool.call without calling next keeps the other settings hooks and the plugins hooks from running', async () => {
    const trace: string[] = [];
    const host = await hostWith({ answering: modAt(trace, 'answering mod', { deny: 'mine' }) });
    const result = await host.fire('tool.call', CALL, compose(trace));
    expect(result).toEqual({ deny: 'mine' });
    // the managed hooks already ran before the chain; the others never did
    expect(trace).toEqual(['managed.sh', 'answering mod']);
  });

  test('a managed hook that does not block leaves the event as it is for the first mod', async () => {
    const seen: unknown[] = [];
    const register = registerOf((on) => {
      on('tool.call', (_$: ModsApi, e: unknown, next: Next) => (seen.push(e), next(e)));
    });
    const host = await hostWith({ first: register });
    await host.fire('tool.call', CALL, compose([]));
    expect(seen).toEqual([CALL]);
  });
});
