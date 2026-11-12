/**
 * statusline.md § Subagent status lines: the command "runs once per refresh tick and receives all
 * visible subagent rows as a single JSON object on stdin", the base hook fields, `columns` and
 * `tasks` (§ Task fields: optional fields "are omitted when they have no value", `tokenSamples` is "Up
 * to the last 16 `tokenCount` readings ... oldest first and ending with the current one"); it writes
 * "one JSON line to stdout per row you want to override, in the form `{"id": "<task id>", "content":
 * "<row body>"}`", the content "rendered as-is, including ANSI colors and OSC 8 hyperlinks", an omitted
 * id keeps the default row and an empty `content` hides it. statusline.md is outside the requirement
 * set (spec/scope-audit.md, "product"), so every case is a judgment (spec/judgments.md), tested
 * outside spec(); so are the cwd, the shell, the exit-0 rule and the lines that are not a row.
 */
import { describe, expect, test } from 'bun:test';
import {
  readSubagentStatusRows,
  runSubagentStatusLine,
  subagentStatusLineInput,
  type SubagentStatusTask,
} from '../../../src/entry/settings.ts';
import type { BaseHookInput } from '../../../src/protocol/official.ts';
import { scriptedRunner } from '../../support/ports.ts';

const BASE: BaseHookInput = {
  session_id: 's1',
  transcript_path: '/home/me/.claude/projects/p/s1.jsonl',
  cwd: '/work/app',
};

const task = (id: string, extra: Partial<SubagentStatusTask> = {}): SubagentStatusTask => ({
  id,
  type: 'local_agent',
  agentType: 'Explore',
  status: 'running',
  description: 'Find the session code',
  label: 'Find the session code',
  startTime: 1_700_000_000_000,
  tokenCount: 1200,
  tokenSamples: [400, 1200],
  cwd: '/work/app',
  ...extra,
});

const LINE = { type: 'command', command: '~/.claude/subagent-statusline.sh' } as const;
const { signal } = new AbortController();

describe('the input', () => {
  test('the base hook fields, columns and the tasks, as one object', () => {
    const input = subagentStatusLineInput(BASE, 80, [task('a1'), task('a2', { name: 'scout' })]);
    expect(input).toEqual({
      ...BASE,
      columns: 80,
      tasks: [task('a1'), task('a2', { name: 'scout' })],
    });
  });

  test('tokenSamples keeps the last 16 readings, oldest first', () => {
    const samples = Array.from({ length: 20 }, (_, index) => index + 1);
    const input = subagentStatusLineInput(BASE, 80, [task('a1', { tokenSamples: samples })]);
    expect(input.tasks[0]?.tokenSamples).toEqual(samples.slice(4));
  });

  test('an optional field with no value is omitted', () => {
    const input = subagentStatusLineInput(BASE, 80, [task('a1')]);
    expect(input.tasks[0]).not.toHaveProperty('model');
    expect(input.tasks[0]).not.toHaveProperty('effort');
  });
});

describe('the output', () => {
  const ids = [task('a1'), task('a2'), task('a3')];

  test('each {"id","content"} line rewrites that row as written; an empty content hides it', () => {
    const stdout = [
      JSON.stringify({ id: 'a1', content: '\u001b[32mscout\u001b[0m · 12k' }),
      JSON.stringify({ id: 'a2', content: '' }),
    ].join('\n');
    expect(readSubagentStatusRows(stdout, ids)).toEqual(
      new Map([
        ['a1', '\u001b[32mscout\u001b[0m · 12k'],
        ['a2', ''],
      ]),
    );
  });

  test('a row the command does not name keeps the default: it is not in the map', () => {
    const rows = readSubagentStatusRows(JSON.stringify({ id: 'a1', content: 'x' }), ids);
    expect(rows.has('a3')).toBe(false);
  });

  test('a line that is not a row, an unknown id or a content that is not a string is ignored', () => {
    const stdout = [
      'starting',
      '{not json',
      JSON.stringify({ id: 'zz', content: 'x' }),
      JSON.stringify({ id: 'a1', content: 3 }),
      JSON.stringify({ id: 'a2' }),
      JSON.stringify([{ id: 'a1', content: 'x' }]),
      '  ' + JSON.stringify({ id: 'a3', content: 'kept' }) + '\r',
    ].join('\n');
    expect(readSubagentStatusRows(stdout, ids)).toEqual(new Map([['a3', 'kept']]));
  });

  test('a later line for the same id wins', () => {
    const stdout = [
      JSON.stringify({ id: 'a1', content: 'first' }),
      JSON.stringify({ id: 'a1', content: 'second' }),
    ].join('\n');
    expect(readSubagentStatusRows(stdout, ids)).toEqual(new Map([['a1', 'second']]));
  });
});

describe('the run', () => {
  const input = subagentStatusLineInput(BASE, 100, [task('a1')]);
  const env = { PATH: '/usr/bin', HOME: '/home/me' };

  test('the command runs in bash from the session cwd with the input on stdin and the host env', async () => {
    const runner = scriptedRunner({ stdout: JSON.stringify({ id: 'a1', content: 'row' }) });
    const rows = await runSubagentStatusLine(LINE, { input, env }, runner, { signal });
    expect(rows).toEqual(new Map([['a1', 'row']]));
    expect(runner.calls).toHaveLength(1);
    const [run] = runner.calls;
    expect(run?.spec).toEqual({ form: 'shell', command: LINE.command, shell: 'bash' });
    expect(run?.cwd).toBe('/work/app');
    expect(run?.env).toEqual(env);
    expect(JSON.parse(run?.stdin ?? '')).toEqual(input);
    expect(run?.timeoutMs).toBeUndefined();
    expect(run?.signal).toBe(signal);
  });

  test('a non-zero exit, a timeout or a command that did not start rewrites no row', async () => {
    const printed = JSON.stringify({ id: 'a1', content: 'row' });
    for (const reply of [
      { exitCode: 1, stdout: printed },
      { exitCode: null, timedOut: true, stdout: printed },
      { exitCode: null, startError: 'bash: not found' },
    ]) {
      const runner = scriptedRunner(reply);
      expect(await runSubagentStatusLine(LINE, { input, env }, runner, { signal })).toEqual(
        new Map(),
      );
    }
  });
});
