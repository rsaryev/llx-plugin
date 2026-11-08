/**
 * `$.fs`: read, write, list, exists, stat and ancestors, and the 4 MiB limit of one file.
 * plugins/mods/reference.md § Mods API methods (`$.fs`), § Limits ("`$.fs.read` and `$.fs.write`:
 * 4 MiB for one file"); plugins/mods/api.md § Reach files, processes, and the network ("Paths: a
 * relative path resolves against the working directory of the session, or of the subagent whose
 * event the hook is handling"; "`$.fs.list` returns one directory's entries as { name, kind, size,
 * isLink } and isn't recursive"); plugins/mods/test.md § Look up what a stub returns (`e.path`
 * arrives as an absolute path).
 */
import { expect, test } from 'bun:test';
import { MODS_API } from '../../../src/protocol/mods-api-names.ts';
import { MOD_LIMITS } from '../../../src/protocol/mods-limits.ts';
import { fn } from '../../support/mods-chain.ts';
import { apiHarness, expectMethods } from '../../support/mods-api.ts';
import { rejection } from '../../support/rejection.ts';
import { spec } from '../../support/spec.ts';

const files = new Map<string, string>([['/work/notes.md', '# Notes']]);
const fsPort = (writes: [string, string][] = []) => ({
  read: (path: string) => {
    const text = files.get(path);
    return Promise.resolve(text === undefined ? undefined : { text, bytes: text.length });
  },
  write: (path: string, text: string) => (writes.push([path, text]), Promise.resolve()),
  list: (path: string) =>
    Promise.resolve(
      path === '/work' ? [{ name: 'notes.md', kind: 'file', size: 7, isLink: false }] : undefined,
    ),
  stat: (path: string) =>
    Promise.resolve(files.has(path) ? { kind: 'file', size: 7, isLink: false } : undefined),
  exists: (path: string) => Promise.resolve(files.has(path)),
  ancestors: (path: string) =>
    Promise.resolve(path === '/work/a/b' ? ['/work/a', '/work', '/'] : []),
});

spec('mods.api.$.fs', () => {
  test('$.fs has the six methods of the reference', async () => {
    const { api } = await apiHarness({ ports: { fs: fsPort() } });
    expectMethods(api.fs, MODS_API.fs);
  });

  test('a relative path resolves against the session working directory; the event path is absolute', async () => {
    const seen: unknown[] = [];
    const h = await apiHarness({ ports: { fs: fsPort() } });
    await h.mod('watch', 'prepend', [fn('fs.read', (_$, e, next) => (seen.push(e), next(e)))]);
    expect(await h.api.fs.read('notes.md')).toBe('# Notes');
    expect(seen).toEqual([{ path: '/work/notes.md' }]);
  });

  test('an absolute path is used as it is', async () => {
    const h = await apiHarness({ ports: { fs: fsPort() } });
    expect(await h.api.fs.read('/work/notes.md')).toBe('# Notes');
  });

  test('the working directory of the subagent whose event the hook handles wins over the session', async () => {
    files.set('/agent/notes.md', 'agent notes');
    const h = await apiHarness({
      ports: { fs: fsPort() },
      options: { eventCwd: () => '/agent' },
    });
    expect(await h.api.fs.read('notes.md')).toBe('agent notes');
  });

  test('a hook on fs.read answers with { value }, as the docs stub does', async () => {
    const h = await apiHarness({ ports: { fs: fsPort() } });
    await h.mod('stub', 'prepend', [
      fn('fs.read', (_$, e) => ({ value: String(e.path).endsWith('notes.md') ? '# Stub' : '' })),
    ]);
    expect(await h.api.fs.read('notes.md')).toBe('# Stub');
  });

  test('write replaces the text; exists and stat answer for one path', async () => {
    const writes: [string, string][] = [];
    const h = await apiHarness({ ports: { fs: fsPort(writes) } });
    await h.api.fs.write('out.txt', 'hello');
    expect(writes).toEqual([['/work/out.txt', 'hello']]);
    expect(await h.api.fs.exists('notes.md')).toBe(true);
    expect(await h.api.fs.exists('missing.md')).toBe(false);
    expect(await h.api.fs.stat('notes.md')).toEqual({ kind: 'file', size: 7, isLink: false });
    expect(await h.api.fs.stat('missing.md')).toBeUndefined();
  });

  test('list returns the directory entries as { name, kind, size, isLink }', async () => {
    const h = await apiHarness({ ports: { fs: fsPort() } });
    expect(await h.api.fs.list('/work')).toEqual([
      { name: 'notes.md', kind: 'file', size: 7, isLink: false },
    ]);
  });

  test('ancestors returns what the host knows above the path', async () => {
    const h = await apiHarness({ ports: { fs: fsPort() } });
    expect(await h.api.fs.ancestors('a/b')).toEqual(['/work/a', '/work', '/']);
  });

  test('a path that is not a string rejects', async () => {
    const h = await apiHarness({ ports: { fs: fsPort() } });
    expect(await rejection(h.api.fs.read(5))).toContain('$.fs.read');
  });
});

const big = (bytes: number) => ({
  read: () => Promise.resolve({ text: 'x', bytes }),
});

spec('mods.limit.$.fs.read', () => {
  test('a file of exactly 4 MiB reads', async () => {
    const h = await apiHarness({ ports: { fs: { ...fsPort(), ...big(MOD_LIMITS.fileBytes) } } });
    expect(await h.api.fs.read('/big')).toBe('x');
  });

  test('a file of one byte more rejects (judgment: the docs give the limit and no message)', async () => {
    const h = await apiHarness({
      ports: { fs: { ...fsPort(), ...big(MOD_LIMITS.fileBytes + 1) } },
    });
    expect(await rejection(h.api.fs.read('/big'))).toContain(
      `over the ${MOD_LIMITS.fileBytes}-byte limit`,
    );
  });
});

spec('mods.limit.$.fs.write', () => {
  test('a text of exactly 4 MiB writes, one byte more rejects before the port is reached', async () => {
    const writes: [string, string][] = [];
    const h = await apiHarness({ ports: { fs: fsPort(writes) } });
    await h.api.fs.write('/ok', 'x'.repeat(MOD_LIMITS.fileBytes));
    expect(writes).toHaveLength(1);
    expect(await rejection(h.api.fs.write('/big', 'x'.repeat(MOD_LIMITS.fileBytes + 1)))).toContain(
      `over the ${MOD_LIMITS.fileBytes}-byte limit`,
    );
    expect(writes).toHaveLength(1);
  });

  test('the limit counts bytes, not characters', async () => {
    const h = await apiHarness({ ports: { fs: fsPort() } });
    // 2 097 153 two-byte characters are 4 194 306 bytes
    expect(
      await rejection(h.api.fs.write('/big', 'é'.repeat(MOD_LIMITS.fileBytes / 2 + 1))),
    ).toContain('byte limit');
  });
});
