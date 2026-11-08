/**
 * hooks.md § "How a hook resolves" (a hook runs only when nothing gates it off: `disableAllHooks`,
 * workspace trust, a plugin that is not enabled, the managed locks), § SessionStart, CwdChanged and
 * FileChanged output (`watchPaths`: "Replaces the current dynamic watch list ... Returning an empty
 * array clears the dynamic list"). `hasRunnableHandler` and `mergeWatchPaths` are the pure parts of
 * the host's `hasHooks` and watch list; no requirement id covers them, so they sit outside
 * `spec(...)`. What they decide where the docs are silent is a row in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import { hasRunnableHandler, mergeWatchPaths } from '../../../src/hooks/select/watch-list.ts';
import {
  command,
  entry,
  managedSettings,
  pluginSource,
  projectSettings,
  session,
  settingsSource,
} from '../../support/hooks-select.ts';

describe('hasRunnableHandler', () => {
  test('is true for a handler of the event, false for the events no handler names', () => {
    const entries = [entry('PreToolUse', { matcher: 'Bash' })];
    expect(hasRunnableHandler(entries, session(), 'PreToolUse')).toBe(true);
    expect(hasRunnableHandler(entries, session(), 'PostToolUse')).toBe(false);
    expect(hasRunnableHandler([], session(), 'PreToolUse')).toBe(false);
  });

  test('a handler gated off does not count: disableAllHooks, trust, a disabled plugin', () => {
    const off = session({ disableAllHooks: { effective: true, managedLocked: false } });
    expect(hasRunnableHandler([entry('Stop')], off, 'Stop')).toBe(false);
    const untrusted = session({ trusted: false });
    expect(
      hasRunnableHandler([entry('Stop', { source: projectSettings })], untrusted, 'Stop'),
    ).toBe(false);
    const pluginHook = entry('Stop', { source: pluginSource('lint') });
    expect(hasRunnableHandler([pluginHook], session({ enabledPlugins: new Set() }), 'Stop')).toBe(
      false,
    );
    expect(
      hasRunnableHandler([pluginHook], session({ enabledPlugins: new Set(['lint']) }), 'Stop'),
    ).toBe(true);
  });

  test('a managed hook still counts under a user-level disableAllHooks, not under the managed one', () => {
    const managed = entry('Stop', { source: managedSettings });
    const user = session({ disableAllHooks: { effective: true, managedLocked: false } });
    const locked = session({ disableAllHooks: { effective: true, managedLocked: true } });
    expect(hasRunnableHandler([managed], user, 'Stop')).toBe(true);
    expect(hasRunnableHandler([managed], locked, 'Stop')).toBe(false);
  });

  test('a handler of a type the event does not support does not count', () => {
    const prompt = entry('SessionEnd', {
      handler: { type: 'prompt', prompt: 'summarize $ARGUMENTS' },
    });
    expect(hasRunnableHandler([prompt], session(), 'SessionEnd')).toBe(false);
    expect(
      hasRunnableHandler([entry('SessionEnd', { handler: command() })], session(), 'SessionEnd'),
    ).toBe(true);
  });

  test('one runnable handler among gated ones is enough', () => {
    const entries = [
      entry('Stop', { source: projectSettings }),
      entry('Stop', { source: settingsSource }),
    ];
    expect(hasRunnableHandler(entries, session({ trusted: false }), 'Stop')).toBe(false);
    expect(hasRunnableHandler(entries, session(), 'Stop')).toBe(true);
  });
});

describe('mergeWatchPaths', () => {
  test('an output that names paths replaces the list, each path once', () => {
    expect(mergeWatchPaths(['/a'], ['/b', '/c', '/b'])).toEqual(['/b', '/c']);
  });

  test('an empty array clears the list', () => {
    expect(mergeWatchPaths(['/a', '/b'], [])).toEqual([]);
  });

  test('an output that names no paths leaves the list as it was', () => {
    const current = ['/a', '/b'];
    expect(mergeWatchPaths(current, undefined)).toEqual(['/a', '/b']);
  });
});
