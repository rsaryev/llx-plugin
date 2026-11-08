/**
 * plugins/loading.md § Check which stage a plugin reached (`installed_plugins.json` "records each
 * install with its `scope`, `installPath`, and `version`") and § Find plugins on disk;
 * plugins/troubleshooting.md § `installed_plugins.json could not be read and was rebuilt` (a file
 * that "isn't valid JSON, or isn't a list of plugins" is rebuilt, the old text kept), § `install
 * records under names that no version of Claude Code can use were removed` (a record "under a key
 * that isn't a valid plugin id" is copied aside and dropped, "the rest of the file loads normally")
 * and § `installed_plugins.json holds a record under "<id>" that this version of Claude Code cannot
 * read` ("While the record is there, this version doesn't rewrite the file"; a file that declares
 * a format this version doesn't know). The messages themselves are tested in install-messages.test.ts.
 * Fields beyond the three the docs name, and a missing `version`, are rows in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import {
  parseInstalledPlugins,
  serializeInstalledPlugins,
} from '../../src/marketplace/installed-plugins.ts';
import { spec } from '../support/spec.ts';

const UNREADABLE_RECORD =
  'install.troubleshooting.installed_plugins.json holds a record under "<id>" that this version of Claude Code cannot read';

const record = (extra: Record<string, unknown> = {}) => ({
  scope: 'user',
  installPath: '/home/u/.claude/plugins/cache/acme/formatter/1.0.0',
  version: '1.0.0',
  ...extra,
});

const file = (plugins: Record<string, unknown>, version: unknown = 2): string =>
  JSON.stringify({ version, plugins });

describe('a readable file', () => {
  test('lists each install with its scope, installPath and version, several per plugin', () => {
    const read = parseInstalledPlugins(
      file({
        'formatter@acme': [
          record(),
          record({ scope: 'project', projectPath: '/work/app', version: '1.1.0' }),
        ],
      }),
    );
    expect(read.issues).toEqual([]);
    expect(read.writable).toBe(true);
    expect(read.records['formatter@acme']).toEqual([
      { scope: 'user', installPath: record().installPath, version: '1.0.0' },
      {
        scope: 'project',
        installPath: record().installPath,
        version: '1.1.0',
        projectPath: '/work/app',
      },
    ]);
  });

  test('no file is no installs and nothing to rewrite', () => {
    const read = parseInstalledPlugins(undefined);
    expect(read.records).toEqual({});
    expect(read.rebuilt).toBeUndefined();
    expect(read.writable).toBe(true);
  });

  test('round trips through serialize, keeping fields the kit does not know', () => {
    const text = file({
      'formatter@acme': [
        record({ gitCommitSha: 'abc', installedAt: '2026-01-01T00:00:00Z', other: 1 }),
      ],
    });
    const again = parseInstalledPlugins(
      serializeInstalledPlugins(parseInstalledPlugins(text).records),
    );
    expect(again.records).toEqual(parseInstalledPlugins(text).records);
    expect(JSON.parse(serializeInstalledPlugins(again.records))).toEqual(JSON.parse(text));
  });
});

spec('install.troubleshooting.installed_plugins.json could not be read and was rebuilt', () => {
  test('text that is not JSON is rebuilt: no installs, the old text kept', () => {
    const read = parseInstalledPlugins('{ not json');
    expect(read.records).toEqual({});
    expect(read.rebuilt).toEqual({ text: '{ not json' });
    expect(read.writable).toBe(true);
  });

  test('an empty file is rebuilt too', () => {
    expect(parseInstalledPlugins('').rebuilt).toEqual({ text: '' });
  });

  test.each([
    ['a list at the top', '[]'],
    ['a number', '3'],
    ['no plugins list', '{"version":2}'],
    ['plugins that is a list', '{"version":2,"plugins":[]}'],
  ])('%s is not a list of plugins', (_label, text) => {
    expect(parseInstalledPlugins(text).rebuilt).toEqual({ text });
  });

  test('a file that reads is never rebuilt', () => {
    expect(parseInstalledPlugins(file({})).rebuilt).toBeUndefined();
  });
});

spec(
  'install.troubleshooting.install records under names that no version of Claude Code can use were removed from installed_plugins.json',
  () => {
    test('a record under a key that is not a plugin id is set aside and dropped, the rest loads', () => {
      const bad = [record()];
      const read = parseInstalledPlugins(
        file({ 'not an id': bad, 'no-origin': bad, 'a@b@c': bad, 'formatter@acme': [record()] }),
      );
      expect(Object.keys(read.records)).toEqual(['formatter@acme']);
      expect(read.setAside).toEqual({ 'not an id': bad, 'no-origin': bad, 'a@b@c': bad });
      expect(read.writable).toBe(true);
      expect(read.unreadable).toEqual([]);
    });

    test('a key named __proto__ is set aside like any other, never taken as the prototype', () => {
      const text = `{"version":2,"plugins":{"__proto__":[${JSON.stringify(record())}],"a b":[1]}}`;
      const read = parseInstalledPlugins(text);
      expect(Object.keys(read.setAside)).toEqual(['__proto__', 'a b']);
      expect(Object.getPrototypeOf(read.setAside)).toBe(Object.prototype);
      expect(read.writable).toBe(true);
    });

    test('a valid id is never set aside, a reserved origin included', () => {
      const read = parseInstalledPlugins(
        file({ 'p@inline': [record()], 'p.q_r-1@m.x': [record()] }),
      );
      expect(read.setAside).toEqual({});
      expect(Object.keys(read.records)).toEqual(['p@inline', 'p.q_r-1@m.x']);
    });
  },
);

spec([UNREADABLE_RECORD, `${UNREADABLE_RECORD}.Several such records`], () => {
  test('a record under a valid id whose fields do not parse is named, and the file is not rewritten', () => {
    const read = parseInstalledPlugins(
      file({ 'new@acme': [record({ scope: 'galaxy' })], 'formatter@acme': [record()] }),
    );
    expect(read.unreadable).toEqual(['new@acme']);
    expect(read.writable).toBe(false);
    expect(Object.keys(read.records)).toEqual(['formatter@acme']);
    expect(read.rebuilt).toBeUndefined();
  });

  test.each([
    ['a missing installPath', record({ installPath: undefined })],
    ['a version that is not text', record({ version: 2 })],
    ['a projectPath that is not text', record({ projectPath: 4 })],
  ])('%s makes the record unreadable', (_label, bad) => {
    expect(parseInstalledPlugins(file({ 'x@acme': [bad] })).unreadable).toEqual(['x@acme']);
  });

  test('a value that is not a list of records is unreadable, and one bad entry makes the whole record so', () => {
    const read = parseInstalledPlugins(
      file({ 'a@acme': record(), 'b@acme': [record(), 'nope'], 'c@acme': [] }),
    );
    expect(read.unreadable).toEqual(['a@acme', 'b@acme']);
    expect(read.records['c@acme']).toEqual([]);
  });

  test('several unreadable records are all named, in file order', () => {
    const read = parseInstalledPlugins(
      file({ 'z@acme': [{}], 'a@acme': [{}], 'ok@acme': [record()] }),
    );
    expect(read.unreadable).toEqual(['z@acme', 'a@acme']);
    expect(read.issues.map((found) => found.severity)).toEqual(['error']);
  });

  test('a file with such a record is not writable, and the record is neither read nor set aside', () => {
    const read = parseInstalledPlugins(file({ 'new@acme': [record({ scope: 'galaxy' })] }));
    expect(read.writable).toBe(false);
    expect(read.records).toEqual({});
    expect(read.setAside).toEqual({});
  });
});

describe('a format this version does not know (troubleshooting.md, the whole-file form)', () => {
  test('names the version, reads no records and is not rewritten', () => {
    const read = parseInstalledPlugins(file({ 'formatter@acme': [record()] }, 3));
    expect(read.unknownFormat).toBe(3);
    expect(read.records).toEqual({});
    expect(read.writable).toBe(false);
    expect(read.issues).toHaveLength(1);
  });

  test('version 2 is the one this version knows', () => {
    expect(parseInstalledPlugins(file({}, 2)).unknownFormat).toBeUndefined();
  });

  test('a file with no numeric version is not a list of plugins in a known format: it is rebuilt', () => {
    const text = JSON.stringify({ plugins: {} });
    expect(parseInstalledPlugins(text).rebuilt).toEqual({ text });
  });
});
