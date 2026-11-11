/**
 * hooks.md § FileChanged: "The `matcher` for this event serves two roles: Build the watch list: the
 * value is split on `|` and each segment is registered as a literal filename in the working
 * directory ... Regex patterns are not useful here ... A `"*"` matcher also matches every file, but
 * Claude Code registers it in the watch list like any other value, as a literal file named `*`";
 * an omitted matcher "adds nothing to the watch list".
 */
import { describe, expect, test } from 'bun:test';
import { fileChangedWatchList } from '../../../src/hooks/select/watch-list.ts';
import { spec } from '../../support/spec.ts';
import {
  command,
  entry,
  HANDLERS,
  pluginSource,
  session,
  settingsSource,
} from '../../support/hooks-select.ts';

spec('hooks.matcher.FileChanged', () => {
  test('`.envrc|.env` watches exactly those two files', () => {
    const list = fileChangedWatchList(
      [entry('FileChanged', { matcher: '.envrc|.env' })],
      session(),
    );
    expect(list).toEqual(['.envrc', '.env']);
  });

  test('a regular expression is registered as the literal file name', () => {
    expect(fileChangedWatchList([entry('FileChanged', { matcher: '^\\.env' })], session())).toEqual(
      ['^\\.env'],
    );
  });

  test('`*` is registered as a file named `*`; an omitted matcher adds nothing', () => {
    expect(fileChangedWatchList([entry('FileChanged', { matcher: '*' })], session())).toEqual([
      '*',
    ]);
    expect(fileChangedWatchList([entry('FileChanged')], session())).toEqual([]);
  });

  test('groups add their names together, once each, and other events add nothing', () => {
    const list = fileChangedWatchList(
      [
        entry('FileChanged', { matcher: '.envrc', handler: command('./a.sh') }),
        entry('FileChanged', { matcher: '.envrc|data.csv', handler: command('./b.sh') }),
        entry('CwdChanged', { matcher: 'ignored' }),
      ],
      session(),
    );
    expect(list).toEqual(['.envrc', 'data.csv']);
  });
});

describe('judgment: an empty segment names no file', () => {
  test('`.env|` and the empty string register nothing for the empty part', () => {
    expect(fileChangedWatchList([entry('FileChanged', { matcher: '.env|' })], session())).toEqual([
      '.env',
    ]);
    expect(fileChangedWatchList([entry('FileChanged', { matcher: '' })], session())).toEqual([]);
  });
});

const list = (entries: Parameters<typeof fileChangedWatchList>[0], hookSession = session()) =>
  fileChangedWatchList(entries, hookSession);

describe('judgment: a handler that never runs registers no watch', () => {
  test('a handler gated off by disableAllHooks, trust or a disabled plugin adds nothing', () => {
    const registered = [
      entry('FileChanged', { matcher: '.env', source: settingsSource }),
      entry('FileChanged', { matcher: '.plug', source: pluginSource('p') }),
    ];
    expect(list(registered, session({ trusted: false, enabledPlugins: new Set() }))).toEqual([]);
    expect(
      list(registered, session({ disableAllHooks: { effective: true, managedLocked: false } })),
    ).toEqual([]);
    expect(list(registered, session({ enabledPlugins: new Set(['p']) }))).toEqual([
      '.env',
      '.plug',
    ]);
  });

  test('a prompt or agent handler, which FileChanged does not support, adds nothing', () => {
    const unsupported = [
      entry('FileChanged', { matcher: '.a', handler: HANDLERS.prompt }),
      entry('FileChanged', { matcher: '.b', handler: HANDLERS.agent }),
      entry('FileChanged', { matcher: '.c', handler: HANDLERS.http }),
    ];
    expect(list(unsupported)).toEqual(['.c']);
  });
});
