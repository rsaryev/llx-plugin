/**
 * plugins/troubleshooting.md § `installed_plugins.json could not be read and was rebuilt` (the old
 * text is kept in `installed_plugins.unreadable.<date>.<hash>.kept`, the file starts over), § `install
 * records under names that no version of Claude Code can use were removed` (the records are copied
 * into `installed_plugins.set-aside.<date>.<hash>.json`, then dropped; the rest loads normally) and §
 * `holds a record under "<id>" that this version of Claude Code cannot read` ("this version doesn't
 * rewrite the file, so the record isn't lost"): the same decisions as `parseInstalledPlugins`,
 * carried out through the `PluginStateStore` port. The copy's date and hash (the day of the clock and
 * the first eight hex digits of the old text's SHA-256) and the copy's content are judgments.
 */
import { describe, expect, test } from 'bun:test';
import { loadInstalledPlugins } from '../../src/marketplace/installed-plugins-store.ts';
import { spec } from '../support/spec.ts';
import { fixedClock } from '../support/ports.ts';
import { fakeSha256 } from '../support/marketplace-ports.ts';
import { memoryStateStore } from '../support/plugin-state.ts';

const signal = new AbortController().signal;
// 2026-11-08T12:00:00Z
const clock = fixedClock(Date.UTC(2026, 10, 8, 12, 0, 0));
const ports = (store: ReturnType<typeof memoryStateStore>) => ({
  store,
  sha256: fakeSha256('abcdef0123456789abcdef'),
  clock,
});

const record = { scope: 'user', installPath: '/p/c/f/1', version: '1' };
const file = (plugins: Record<string, unknown>, version = 2) =>
  JSON.stringify({ version, plugins });

describe('a healthy file', () => {
  test('is read and nothing is written', async () => {
    const store = memoryStateStore({ 'installed_plugins.json': file({ 'f@acme': [record] }) });
    const loaded = await loadInstalledPlugins(ports(store), signal);
    expect(loaded.read.records['f@acme']).toHaveLength(1);
    expect(loaded.failure).toBeUndefined();
    expect(store.writes).toEqual([]);
  });

  test('no file is no installs and nothing is written', async () => {
    const store = memoryStateStore();
    const loaded = await loadInstalledPlugins(ports(store), signal);
    expect(loaded.read.records).toEqual({});
    expect(store.writes).toEqual([]);
  });
});

spec('install.troubleshooting.installed_plugins.json could not be read and was rebuilt', () => {
  test('keeps the old text in a dated .kept copy, then starts the file over', async () => {
    const store = memoryStateStore({ 'installed_plugins.json': '{ not json' });
    await loadInstalledPlugins(ports(store), signal);
    expect(store.writes.map((write) => write.name)).toEqual([
      'installed_plugins.unreadable.2026-11-08.abcdef01.kept',
      'installed_plugins.json',
    ]);
    expect(store.writes[0]?.text).toBe('{ not json');
    expect(JSON.parse(store.files['installed_plugins.json'] ?? '')).toEqual({
      version: 2,
      plugins: {},
    });
  });

  test('the copy is written before the file is touched: a failed copy leaves the old file alone', async () => {
    const store = memoryStateStore({ 'installed_plugins.json': 'garbage' }, [
      'installed_plugins.unreadable.2026-11-08.abcdef01.kept',
    ]);
    const loaded = await loadInstalledPlugins(ports(store), signal);
    expect(loaded.failure?.failure).toBe('write');
    expect(store.files['installed_plugins.json']).toBe('garbage');
  });
});

spec(
  'install.troubleshooting.install records under names that no version of Claude Code can use were removed from installed_plugins.json',
  () => {
    test('copies the unusable records into a dated .set-aside file, then drops them and keeps the rest', async () => {
      const store = memoryStateStore({
        'installed_plugins.json': file({ 'bad name': [record], 'f@acme': [record] }),
      });
      const loaded = await loadInstalledPlugins(ports(store), signal);
      expect(store.writes.map((write) => write.name)).toEqual([
        'installed_plugins.set-aside.2026-11-08.abcdef01.json',
        'installed_plugins.json',
      ]);
      expect(JSON.parse(store.writes[0]?.text ?? '')).toEqual({ 'bad name': [record] });
      expect(Object.keys(JSON.parse(store.files['installed_plugins.json'] ?? '').plugins)).toEqual([
        'f@acme',
      ]);
      expect(Object.keys(loaded.read.records)).toEqual(['f@acme']);
    });
  },
);

spec(
  `install.troubleshooting.installed_plugins.json holds a record under "<id>" that this version of Claude Code cannot read`,
  () => {
    test('does not rewrite the file while such a record is there, and drops nothing', async () => {
      const text = file({ 'new@acme': [{ scope: 'galaxy' }], 'bad name': [record] });
      const store = memoryStateStore({ 'installed_plugins.json': text });
      const loaded = await loadInstalledPlugins(ports(store), signal);
      expect(store.writes).toEqual([]);
      expect(store.files['installed_plugins.json']).toBe(text);
      expect(loaded.read.unreadable).toEqual(['new@acme']);
    });

    test('a format this version does not know is left as it is too', async () => {
      const text = file({}, 9);
      const store = memoryStateStore({ 'installed_plugins.json': text });
      await loadInstalledPlugins(ports(store), signal);
      expect(store.writes).toEqual([]);
    });
  },
);
