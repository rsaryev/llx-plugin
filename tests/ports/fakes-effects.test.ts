/** The fakes of the effect ports behave as their ports document; hosts' tests rely on them. */
import { describe, expect, test } from 'bun:test';
import {
  fakeMcp,
  fakeModel,
  memoryFiles,
  recordingHttp,
  scriptedRunner,
} from '../support/ports.ts';
import { rejection } from '../support/rejection.ts';

const signal = new AbortController().signal;
const run = {
  spec: { form: 'shell', command: 'ls', shell: 'bash' },
  cwd: '/',
  env: {},
  signal,
} as const;

describe('memoryFiles', () => {
  const files = memoryFiles({
    'a.txt': 'hi',
    'dir/b.md': 'bee',
    'dir/sub/c.md': 'sea',
    bin: new Uint8Array([1, 2]),
  });
  test('reads text and bytes; a missing file is undefined', async () => {
    expect(await files.readText('a.txt')).toBe('hi');
    expect(await files.readText('./dir/b.md')).toBe('bee');
    expect(await files.readBytes('bin')).toEqual(new Uint8Array([1, 2]));
    expect(await files.readText('nope')).toBeUndefined();
    expect(files.reads).toEqual(['a.txt', './dir/b.md', 'bin', 'nope']);
  });
  test('lists a directory sorted, marking sub-directories', async () => {
    expect(await files.list('dir')).toEqual([
      { name: 'b.md', isFile: true, isDirectory: false },
      { name: 'sub', isFile: false, isDirectory: true },
    ]);
    expect((await files.list('.'))?.map((entry) => entry.name)).toEqual(['a.txt', 'bin', 'dir']);
    expect(await files.list('missing')).toBeUndefined();
    expect(await files.list('a.txt')).toBeUndefined();
  });
  test('a symlink stats as a link with its target and reads through it', async () => {
    const linked = memoryFiles({
      'real.txt': 'hi',
      'dir/inner.md': 'x',
      'link.txt': { symlink: 'real.txt' },
      'hop.txt': { symlink: './link.txt' },
      dirlink: { symlink: 'dir' },
      'escape.txt': { symlink: '../outside.txt' },
      'abs.txt': { symlink: '/etc/passwd' },
      'loop.txt': { symlink: 'loop.txt' },
    });
    expect(await linked.stat('link.txt')).toEqual({
      isFile: true,
      isDirectory: false,
      isSymlink: true,
      size: 2,
      realPath: 'real.txt',
    });
    expect((await linked.stat('hop.txt'))?.realPath).toBe('real.txt');
    expect(await linked.readText('hop.txt')).toBe('hi');
    expect(await linked.stat('dirlink')).toMatchObject({ isDirectory: true, realPath: 'dir' });
    expect((await linked.list('dirlink'))?.map((entry) => entry.name)).toEqual(['inner.md']);
    expect(await linked.stat('escape.txt')).toEqual({
      isFile: false,
      isDirectory: false,
      isSymlink: true,
      size: 0,
      realPath: '../outside.txt',
    });
    expect((await linked.stat('abs.txt'))?.realPath).toBe('/etc/passwd');
    expect(await linked.readText('escape.txt')).toBeUndefined();
    expect(await linked.readText('loop.txt')).toBeUndefined();
    expect(await linked.exists('escape.txt')).toBe(true);
    const names = (await linked.list('.'))?.map((e) => [e.name, e.isFile, e.isDirectory]);
    expect(names).toContainEqual(['link.txt', true, false]);
    expect(names).toContainEqual(['dirlink', false, true]);
  });
  test('records every access, not only reads', async () => {
    const seen = memoryFiles({ 'a.txt': 'hi' });
    await seen.stat('a.txt');
    await seen.exists('b');
    await seen.list('.');
    await seen.readBytes('a.txt');
    await seen.readText('a.txt');
    expect(seen.accesses).toEqual([
      { operation: 'stat', path: 'a.txt' },
      { operation: 'exists', path: 'b' },
      { operation: 'list', path: '.' },
      { operation: 'readBytes', path: 'a.txt' },
      { operation: 'readText', path: 'a.txt' },
    ]);
    expect(seen.reads).toEqual(['a.txt', 'a.txt']);
  });
  test('stats files and directories', async () => {
    expect(await files.stat('a.txt')).toEqual({
      isFile: true,
      isDirectory: false,
      isSymlink: false,
      size: 2,
    });
    expect((await files.stat('dir/sub'))?.isDirectory).toBe(true);
    expect(await files.stat('dir/zzz')).toBeUndefined();
    expect(await files.exists('dir')).toBe(true);
    expect(await files.exists('dir/zzz')).toBe(false);
  });
});

describe('scriptedRunner', () => {
  test('answers in order with defaults, records runs and accepts a function', async () => {
    const runner = scriptedRunner({ stdout: 'one' }, (given) => ({
      exitCode: 2,
      stderr: given.cwd,
    }));
    expect(await runner.run(run)).toEqual({
      exitCode: 0,
      stdout: 'one',
      stderr: '',
      timedOut: false,
    });
    expect(await runner.run(run)).toEqual({
      exitCode: 2,
      stdout: '',
      stderr: '/',
      timedOut: false,
    });
    expect(runner.calls).toHaveLength(2);
  });
  test('a spent script throws', async () => {
    expect(await rejection(scriptedRunner().run(run))).toContain('no reply for run 1');
  });
});

describe('recordingHttp', () => {
  const request = { method: 'GET', url: 'https://x.test', headers: {}, signal } as const;
  test('answers with defaults, passes failures through and records requests', async () => {
    const http = recordingHttp({ status: 404 }, { failure: 'timeout', message: 'slow' });
    expect(await http.request(request)).toEqual({
      status: 404,
      headers: {},
      body: '',
      truncated: false,
    });
    expect(await http.request(request)).toEqual({ failure: 'timeout', message: 'slow' });
    expect(http.requests.map((r) => r.url)).toEqual(['https://x.test', 'https://x.test']);
    expect(await rejection(http.request(request))).toContain('no reply for request 3');
  });
});

describe('recordingHttp bodies', () => {
  const get = { method: 'GET', url: 'https://x.test/a.zip', headers: {}, signal } as const;
  test('as bytes answers with bytes and an empty body; text decodes them', async () => {
    const zip = new Uint8Array([0x50, 0x4b, 0xff, 0x00]);
    const http = recordingHttp({ bytes: zip }, { bytes: zip });
    const raw = await http.request({ ...get, as: 'bytes' });
    expect(raw).toMatchObject({ body: '', bytes: zip, truncated: false });
    const text = await http.request(get);
    expect(text).toMatchObject({ body: 'PK\ufffd\u0000', truncated: false });
    expect(text).not.toHaveProperty('bytes');
  });
  test('a text reply is encoded when bytes are asked for', async () => {
    const http = recordingHttp({ body: 'héllo' });
    const raw = await http.request({ ...get, as: 'bytes' });
    expect('bytes' in raw ? raw.bytes : undefined).toEqual(new TextEncoder().encode('héllo'));
  });
  test('maxBytes counts bytes and sets truncated', async () => {
    const http = recordingHttp({ body: 'héllo' }, { bytes: new Uint8Array(10) });
    const text = await http.request({ ...get, maxBytes: 2 });
    expect(text).toMatchObject({ body: 'h\ufffd', truncated: true });
    const raw = await http.request({ ...get, as: 'bytes', maxBytes: 4 });
    expect('bytes' in raw ? raw.bytes?.length : 0).toBe(4);
    expect(raw).toMatchObject({ truncated: true });
  });
});

describe('fakeModel and fakeMcp', () => {
  test('fakeModel serves evaluate and runAgent from one script and records calls', async () => {
    const model = fakeModel({ text: 'ok' }, { failure: 'boom', message: 'x' });
    expect(await model.evaluate({ prompt: 'p', signal })).toEqual({ text: 'ok' });
    expect(await model.runAgent({ prompt: 'q', tools: ['Read'], signal })).toEqual({
      failure: 'boom',
      message: 'x',
    });
    expect(model.calls.map((call) => call.tools)).toEqual([undefined, ['Read']]);
    expect(await rejection(model.evaluate({ prompt: 'r', signal }))).toContain(
      'no reply for call 3',
    );
  });
  test('fakeMcp knows its servers and tools', async () => {
    const mcp = fakeMcp({
      connected: ['db'],
      tools: { 'db/query': { isError: false, text: 'rows' } },
    });
    expect(await mcp.ensureConnected('db', 10, signal)).toBe('connected');
    expect(await mcp.ensureConnected('other', 10, signal)).toBe('unavailable');
    expect(await mcp.callTool({ server: 'db', tool: 'query', input: {}, signal })).toEqual({
      isError: false,
      text: 'rows',
    });
    expect(await mcp.callTool({ server: 'db', tool: 'drop', input: {}, signal })).toEqual({
      failure: 'no-such-tool',
      message: 'db/drop',
    });
    expect(mcp.calls).toHaveLength(2);
  });
});
