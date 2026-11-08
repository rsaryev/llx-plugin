/**
 * settings-reference.md § Helper failures (under `policyHelper`): which runs fail and what a failed
 * run costs at startup, after a fetch removed server-managed settings, and on a background refresh.
 */
import { expect, test } from 'bun:test';
import { spec } from '../../support/spec.ts';
import { PATH, envelope, failed, run } from '../../support/managed-helper.ts';

spec('policy.reference.Helper failures', () => {
  test('a path that breaks the rules fails the run without starting the helper', async () => {
    const { result, runner } = await run({ path: 'relative/policy' });
    expect(failed(result)).toBeDefined();
    expect(runner.calls).toHaveLength(0);
  });

  test('no regular file at the path fails the run', async () => {
    const { result, runner } = await run({ files: [] });
    expect(failed(result)?.reason).toContain(PATH);
    expect(runner.calls).toHaveLength(0);
  });

  test('the file check shares the timeoutMs budget, so an unresponsive mount fails the run', async () => {
    const { result, runner } = await run({ slow: 6000 });
    expect(failed(result)?.reason).toContain('5000');
    expect(runner.calls).toHaveLength(0);
  });

  test('the time the file check took is taken from the helper run budget', async () => {
    const { runner } = await run({ slow: 1500 });
    expect(runner.calls[0]?.timeoutMs).toBe(3500);
  });

  test('a non-zero exit, a timeout and a helper that does not start each fail', async () => {
    expect(failed((await run({ reply: { exitCode: 3, stderr: 'boom' } })).result)).toBeDefined();
    expect(failed((await run({ reply: { exitCode: null, timedOut: true } })).result)).toBeDefined();
    expect(
      failed((await run({ reply: { exitCode: null, startError: 'EACCES' } })).result),
    ).toBeDefined();
  });

  test('stdout that is not a single JSON object fails the run', async () => {
    for (const stdout of ['', 'not json', '[1]', '{"a":1}{"b":2}', '"text"']) {
      expect(failed((await run({ reply: { stdout } })).result)).toBeDefined();
    }
  });

  test('a managedSettings with a schema violation Claude Code cannot repair fails the run', async () => {
    expect(
      failed((await run({ reply: envelope({ allowManagedPermissionRulesOnly: 'maybe' }) })).result),
    ).toBeDefined();
    expect(failed((await run({ reply: envelope('text') })).result)).toBeDefined();
    expect(failed((await run({ reply: envelope({ model: 7 }) })).result)).toBeDefined();
  });

  test('a violation Claude Code can repair, such as one invalid permission rule, does not fail the run', async () => {
    const { result } = await run({
      reply: envelope({ permissions: { deny: ['Read(./.env)', 42] } }),
    });
    expect(result).toMatchObject({
      ok: true,
      settings: { permissions: { deny: ['Read(./.env)'] } },
    });
  });

  test('a startup failure refuses to start', async () => {
    const { result } = await run({ reply: { exitCode: 1 } });
    expect(failed(result)?.outcome.stopsClaudeCode).toBe(true);
  });

  test('after a non-zero exit the reason includes stderr, or stdout when stderr is empty', async () => {
    const withStderr = await run({
      reply: { exitCode: 2, stderr: 'device not enrolled', stdout: 'ignored' },
    });
    expect(failed(withStderr.result)?.reason).toContain('device not enrolled');
    expect(failed(withStderr.result)?.reason).not.toContain('ignored');
    const withStdout = await run({ reply: { exitCode: 2, stderr: '', stdout: 'only stdout' } });
    expect(failed(withStdout.result)?.reason).toContain('only stdout');
  });

  test('after a timeout the reason names the timeoutMs limit and includes none of the helper output', async () => {
    const { result } = await run({
      reply: { exitCode: null, timedOut: true, stdout: 'secret out', stderr: 'secret err' },
    });
    expect(failed(result)?.reason).toContain('timeoutMs');
    expect(failed(result)?.reason).toContain('5000');
    expect(failed(result)?.reason).not.toContain('secret');
  });

  test('a run that starts after a fetch reports the server-managed settings removed ends the session like a failed startup', async () => {
    const { result } = await run({ reply: { exitCode: 1 }, phase: 'fetchRemoved' });
    expect(failed(result)?.outcome.stopsClaudeCode).toBe(true);
  });

  test('a failed background refresh keeps the last successful policy and /status shows the reason', async () => {
    const { result } = await run({ reply: { exitCode: 1, stderr: 'stale' }, phase: 'refresh' });
    const outcome = failed(result)?.outcome;
    expect(outcome?.stopsClaudeCode).toBe(false);
    expect(outcome?.keepsLastPolicy).toBe(true);
    expect(outcome?.shownInStatus).toBe(true);
    expect(failed(result)?.reason).toContain('stale');
  });

  test('each refresh runs under the same timeoutMs and failure rules as the startup run', async () => {
    const { result, runner } = await run({
      phase: 'refresh',
      reply: { exitCode: null, timedOut: true },
    });
    expect(runner.calls[0]?.timeoutMs).toBe(5000);
    expect(failed(result)?.reason).toContain('timeoutMs');
  });

  test('the helper stderr of every run is handed back for the debug log', async () => {
    const ok = await run({ reply: { stdout: '{}', stderr: 'debug line' } });
    expect(ok.result.stderr).toBe('debug line');
    const bad = await run({ reply: { exitCode: 1, stderr: 'debug failure' } });
    expect(bad.result.stderr).toBe('debug failure');
  });

  test('a helper that needs outage resilience serves from its own cache and exits 0, which succeeds', async () => {
    expect((await run({ reply: envelope({ model: 'cached' }) })).result.ok).toBe(true);
  });
});
