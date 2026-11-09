/**
 * hooks.md, "Command hooks" and "Hooks in skills and agents": shell execution, scoped sources,
 * and once after successful execution. Host option names are a judgment, not compatibility.
 */
import { expect, test } from 'bun:test';
import { createPluginHost } from '../../src/host/index.ts';
import { fakeEnvironment, locations, scriptedRunner } from '../support/ports.ts';
import { SESSION, signal } from '../support/host.ts';
import type { HooksSettings } from '../../src/protocol/hook-config.ts';

function opened() {
  const runner = scriptedRunner(...Array.from({ length: 8 }, () => ({})));
  const host = createPluginHost({
    plugins: [],
    ports: {
      commands: runner,
      locations: { ...locations(), existingDirectory: async () => '/fallback' },
      environment: fakeEnvironment(),
    },
    hookExecution: {
      defaultShell: 'powershell',
      shellPaths: 'environment-reference',
      startDirectory: '/fallback',
    },
  });
  return { session: host.openSession(SESSION), runner };
}

test('the high-level host forwards hook shell and fallback execution options', async () => {
  const { session, runner } = opened();
  session.addHooks(
    'run',
    {
      SessionStart: [
        { hooks: [{ type: 'command', command: 'Write-Output "${CLAUDE_PROJECT_DIR}"' }] },
      ],
    },
    { kind: 'session', label: '[run]' },
  );
  await session.dispatch('SessionStart', { source: 'startup' }, { signal: signal() });
  expect(runner.calls[0]?.spec).toMatchObject({ shell: 'powershell' });
  expect(runner.calls[0]?.spec.command).toContain('${env:CLAUDE_PROJECT_DIR}');
  expect(runner.calls[0]?.cwd).toBe('/fallback');
});

test('a source-limited dispatch does not remove or run another source', async () => {
  const { session, runner } = opened();
  const hooks: HooksSettings = { Stop: [{ hooks: [{ type: 'command', command: 'echo stop' }] }] };
  session.addHooks('skill', hooks, { kind: 'skill', label: '[skill]' });
  session.addHooks('agent', hooks, { kind: 'agent', label: '[agent]' });
  await session.dispatch(
    'Stop',
    { stop_hook_active: false },
    {
      signal: signal(),
      sourcesOnly: ['agent'],
    },
  );
  expect(runner.calls).toHaveLength(1);
  await session.dispatch('Stop', { stop_hook_active: false }, { signal: signal() });
  expect(runner.calls).toHaveLength(3);
});
