/**
 * The published testing entry (docs/API.md, "Testing kit"): `@rsaryev/claude-plugin-kit/testing`
 * holds one in-memory fake per port, and the scripted ones refuse to guess. These are integration
 * tests of the entry, outside `spec()`: the docs name the kit, not its behaviour.
 */
import { describe, expect, test } from 'bun:test';
import type { CommandRun } from '../../src/ports/index.ts';
import { rejection } from '../support/rejection.ts';
import * as testing from '../../src/testing/index.ts';
import * as support from '../support/ports.ts';
import pkg from '../../package.json';

const run = (): CommandRun => ({
  spec: { form: 'shell', command: 'x', shell: 'bash' },
  cwd: '/',
  env: {},
  signal: new AbortController().signal,
});

describe('the testing entry', () => {
  test('exports a fake of every port', () => {
    expect(Object.keys(testing).toSorted()).toEqual([
      'fakeEnvironment',
      'fakeMcp',
      'fakeModel',
      'fixedClock',
      'folderScan',
      'locations',
      'memoryFiles',
      'memoryScratch',
      'recordingHttp',
      'scriptedRunner',
    ]);
  });

  test('tests/support re-exports the same copy, not another one', () => {
    expect(support.memoryFiles).toBe(testing.memoryFiles);
    expect(support.scriptedRunner).toBe(testing.scriptedRunner);
  });

  test('package.json publishes it as ./testing, built to dist/testing', () => {
    expect(pkg.exports['./testing']).toEqual({
      types: './dist/testing/index.d.ts',
      bun: './src/testing/index.ts',
      import: './dist/testing/index.js',
    });
  });

  test('a scripted fake answers in order, records, and throws when the script is spent', async () => {
    const runner = testing.scriptedRunner({ stdout: 'one' });
    expect((await runner.run(run())).stdout).toBe('one');
    expect(runner.calls).toHaveLength(1);
    expect(await rejection(runner.run(run()))).toContain('no reply for run 2');
  });

  test('memory files read what they hold and report absence as undefined', async () => {
    const files = testing.memoryFiles({ 'a/b.txt': 'hi' });
    expect(await files.readText('a/b.txt')).toBe('hi');
    expect(await files.readText('missing')).toBeUndefined();
  });
});
