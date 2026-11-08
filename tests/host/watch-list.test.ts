/**
 * `session.fileChangedWatchList()` (hooks.md, "FileChanged": the matcher's literal names; "CwdChanged
 * output" and "FileChanged output": `watchPaths` "Replaces the current dynamic watch list. Paths from
 * your `matcher` configuration are always watched. Returning an empty array clears the dynamic list";
 * "SessionStart decision control": `watchPaths` seeds it): the static names plus the dynamic paths
 * the outputs of SessionStart, CwdChanged and FileChanged set. Integration tests of the host,
 * outside `spec()`; how the slot is replaced is a row in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import { createPolicyView } from '../../src/settings/index.ts';
import { hostOf, loaded, SESSION, signal } from '../support/host.ts';
import { layerOf } from '../support/settings-layers.ts';

const json = (value: unknown): string => JSON.stringify(value);

const paths = (event: string, watchPaths?: readonly string[]) => ({
  stdout: json({
    hookSpecificOutput: {
      hookEventName: event,
      ...(watchPaths === undefined ? {} : { watchPaths }),
    },
  }),
});

async function watching(runs: readonly object[]) {
  const plugin = await loaded({
    '.claude-plugin/plugin.json': json({ name: 'envwatch' }),
    'hooks/hooks.json': json({
      hooks: {
        FileChanged: [
          { matcher: '.envrc|.env', hooks: [{ type: 'command', command: './on-env.sh' }] },
        ],
        CwdChanged: [{ hooks: [{ type: 'command', command: './on-cd.sh' }] }],
        SessionStart: [{ hooks: [{ type: 'command', command: './on-start.sh' }] }],
      },
    }),
  });
  const fixture = await hostOf({ plugins: [{ id: 'envwatch@acme', plugin }], runs });
  return { ...fixture, session: fixture.host.openSession(SESSION) };
}

const changed = { file_path: '/work/app/.envrc', event: 'change' } as const;

describe('session.fileChangedWatchList', () => {
  test('is the static literal names of the FileChanged matchers before any output', async () => {
    const { session } = await watching([]);
    expect(session.fileChangedWatchList()).toEqual(['.envrc', '.env']);
  });

  test('a SessionStart output seeds the dynamic paths after the static names', async () => {
    const { session } = await watching([paths('SessionStart', ['/work/app/config/a.toml'])]);
    await session.dispatch('SessionStart', { source: 'startup' }, { signal: signal() });
    expect(session.fileChangedWatchList()).toEqual(['.envrc', '.env', '/work/app/config/a.toml']);
  });

  test('a CwdChanged output replaces the dynamic list, not the static names', async () => {
    const { session } = await watching([
      paths('SessionStart', ['/a/one']),
      paths('CwdChanged', ['/b/two', '/b/three']),
    ]);
    await session.dispatch('SessionStart', { source: 'startup' }, { signal: signal() });
    await session.dispatch('CwdChanged', { old_cwd: '/a', new_cwd: '/b' }, { signal: signal() });
    expect(session.fileChangedWatchList()).toEqual(['.envrc', '.env', '/b/two', '/b/three']);
  });

  test('a FileChanged output replaces it too', async () => {
    const { session } = await watching([
      paths('CwdChanged', ['/b/two']),
      paths('FileChanged', ['/b/found']),
    ]);
    await session.dispatch('CwdChanged', { old_cwd: '/a', new_cwd: '/b' }, { signal: signal() });
    await session.dispatch('FileChanged', changed, { signal: signal() });
    expect(session.fileChangedWatchList()).toEqual(['.envrc', '.env', '/b/found']);
  });

  test('an empty array clears the dynamic list', async () => {
    const { session } = await watching([
      paths('SessionStart', ['/a/one']),
      paths('CwdChanged', []),
    ]);
    await session.dispatch('SessionStart', { source: 'startup' }, { signal: signal() });
    await session.dispatch('CwdChanged', { old_cwd: '/a', new_cwd: '/b' }, { signal: signal() });
    expect(session.fileChangedWatchList()).toEqual(['.envrc', '.env']);
  });

  test('an output without watchPaths leaves the dynamic list as it was', async () => {
    const { session } = await watching([paths('SessionStart', ['/a/one']), paths('CwdChanged')]);
    await session.dispatch('SessionStart', { source: 'startup' }, { signal: signal() });
    await session.dispatch('CwdChanged', { old_cwd: '/a', new_cwd: '/b' }, { signal: signal() });
    expect(session.fileChangedWatchList()).toEqual(['.envrc', '.env', '/a/one']);
  });

  test('a path that is also a static name is listed once', async () => {
    const { session } = await watching([paths('CwdChanged', ['.env', '/b/x'])]);
    await session.dispatch('CwdChanged', { old_cwd: '/a', new_cwd: '/b' }, { signal: signal() });
    expect(session.fileChangedWatchList()).toEqual(['.envrc', '.env', '/b/x']);
  });

  test('the list belongs to the session: every turn view reads and replaces the same one', async () => {
    const { session } = await watching([paths('CwdChanged', ['/b/two'])]);
    await session
      .withTurn({ cwd: '/b' })
      .dispatch('CwdChanged', { old_cwd: '/a', new_cwd: '/b' }, { signal: signal() });
    expect(session.fileChangedWatchList()).toEqual(['.envrc', '.env', '/b/two']);
    expect(session.withTurn({ promptId: 'p' }).fileChangedWatchList()).toEqual([
      '.envrc',
      '.env',
      '/b/two',
    ]);
  });

  test('a hook that failed leaves the list alone', async () => {
    const { session } = await watching([{ exitCode: 1, stderr: 'boom' }]);
    await session.dispatch('CwdChanged', { old_cwd: '/a', new_cwd: '/b' }, { signal: signal() });
    expect(session.fileChangedWatchList()).toEqual(['.envrc', '.env']);
  });

  test('static names of a handler gated off by workspace trust are not listed', async () => {
    const settings = createPolicyView([
      layerOf('project', {
        hooks: {
          FileChanged: [
            { matcher: '.tool-versions', hooks: [{ type: 'command', command: './t.sh' }] },
          ],
        },
      }),
    ]);
    const { host } = await hostOf({ plugins: [], settings });
    expect(host.openSession({ ...SESSION, trusted: false }).fileChangedWatchList()).toEqual([]);
    expect(host.openSession(SESSION).fileChangedWatchList()).toEqual(['.tool-versions']);
  });
});
