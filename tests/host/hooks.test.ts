/**
 * What `session.dispatch` runs (hooks.md, "Configuration", "Matcher patterns", "Common fields",
 * "Exit code output", "HTTP hook fields", "Disable or remove hooks", "Hook locations"; plugins/
 * components.md, "Hooks"; settings-reference.md, `allowedHttpHookUrls`): the hooks of every enabled
 * plugin through the real engine, matchers and `if` from the real rules, the policy of the
 * settings. End-to-end over the real loader and the fakes of the ports: integration tests of the
 * host, outside `spec()`.
 */
import { describe, expect, test } from 'bun:test';
import { createPolicyView } from '../../src/settings/index.ts';
import { hostOf, SESSION, signal } from '../support/host.ts';
import { layerOf } from '../support/settings-layers.ts';

const write = {
  tool_name: 'Write',
  tool_input: { file_path: '/work/app/a.ts' },
  tool_use_id: 't1',
};
const bash = (command: string) => ({
  tool_name: 'Bash',
  tool_input: { command },
  tool_use_id: 't2',
});

describe('session.dispatch(PreToolUse)', () => {
  test('a Write call runs the Write|Edit hook, with the plugin root in its command', async () => {
    const { host, runner } = await hostOf({ runs: [{}] });
    const outcome = await host
      .openSession(SESSION)
      .dispatch('PreToolUse', write, { signal: signal() });
    expect(outcome.proceed).toBe(true);
    expect(runner.calls.map((run) => run.spec)).toEqual([
      { form: 'shell', command: '/plugins/formatter@acme-tools/hooks/guard.sh', shell: 'bash' },
    ]);
  });

  test('the hook gets the official input: the common fields of the session and the call', async () => {
    const { host, runner } = await hostOf({ runs: [{}] });
    await host
      .openSession({ ...SESSION, effort: { level: 'high' } })
      .dispatch('PreToolUse', write, { signal: signal() });
    expect(JSON.parse(runner.calls[0]?.stdin ?? '{}')).toMatchObject({
      session_id: 'sess-1',
      transcript_path: '/work/.claude/sess-1.jsonl',
      cwd: '/work/app',
      permission_mode: 'default',
      effort: { level: 'high' },
      hook_event_name: 'PreToolUse',
      tool_name: 'Write',
      tool_input: { file_path: '/work/app/a.ts' },
    });
  });

  test('exit code 2 blocks the call and gives the hook stderr as the reason', async () => {
    const { host } = await hostOf({ runs: [{ exitCode: 2, stderr: 'vendor/ is read-only' }] });
    const outcome = await host
      .openSession(SESSION)
      .dispatch('PreToolUse', write, { signal: signal() });
    expect(outcome.proceed).toBe(false);
    expect(outcome.block?.reason).toBe('vendor/ is read-only');
  });

  test('`if: "Bash(git *)"` runs the hook for a git command only', async () => {
    const { host, runner } = await hostOf({ runs: [{}] });
    const session = host.openSession(SESSION);
    await session.dispatch('PreToolUse', bash('ls -la'), { signal: signal() });
    expect(runner.calls).toHaveLength(0);
    await session.dispatch('PreToolUse', bash('git status'), { signal: signal() });
    expect(runner.calls.map((run) => run.spec.command)).toEqual([
      '/plugins/formatter@acme-tools/hooks/git-audit.sh',
    ]);
  });

  test('a tool no matcher names runs nothing', async () => {
    const { host, runner } = await hostOf();
    await host
      .openSession(SESSION)
      .dispatch('PreToolUse', { ...write, tool_name: 'Read' }, { signal: signal() });
    expect(runner.calls).toHaveLength(0);
  });

  test('the hooks of a disabled plugin never run', async () => {
    const { host, runner } = await hostOf({ runs: [{}] });
    await host.openSession(SESSION).dispatch('PreToolUse', write, { signal: signal() });
    expect(runner.calls.map((run) => run.spec.command).join()).not.toContain('never.sh');
  });
});

describe('session.dispatch(PostToolUse) through an http hook', () => {
  const post = { ...write, tool_response: { ok: true } };

  test('posts the input to the hook URL', async () => {
    const { host, web } = await hostOf({ http: [{ status: 200, body: '{}' }] });
    const outcome = await host
      .openSession(SESSION)
      .dispatch('PostToolUse', post, { signal: signal() });
    expect(outcome.proceed).toBe(true);
    expect(web.requests.map((request) => [request.method, request.url])).toEqual([
      ['POST', 'https://hooks.example/audit'],
    ]);
    expect(JSON.parse(web.requests[0]?.body ?? '{}')).toMatchObject({
      hook_event_name: 'PostToolUse',
      tool_name: 'Write',
    });
  });

  test('allowedHttpHookUrls from the settings blocks a URL it does not list', async () => {
    const settings = createPolicyView([
      layerOf('user', { allowedHttpHookUrls: ['https://other.example/*'] }),
    ]);
    const { host, web } = await hostOf({ settings });
    await host.openSession(SESSION).dispatch('PostToolUse', post, { signal: signal() });
    expect(web.requests).toHaveLength(0);
  });

  test('a URL the list names goes through', async () => {
    const settings = createPolicyView([
      layerOf('user', { allowedHttpHookUrls: ['https://hooks.example/*'] }),
    ]);
    const { host, web } = await hostOf({ settings, http: [{ status: 200, body: '{}' }] });
    await host.openSession(SESSION).dispatch('PostToolUse', post, { signal: signal() });
    expect(web.requests).toHaveLength(1);
  });
});

describe('session.dispatch under the settings policy', () => {
  test('disableAllHooks in user settings turns every plugin hook off', async () => {
    const settings = createPolicyView([layerOf('user', { disableAllHooks: true })]);
    const { host, runner, web } = await hostOf({ settings });
    const session = host.openSession(SESSION);
    await session.dispatch('PreToolUse', write, { signal: signal() });
    await session.dispatch('PostToolUse', { ...write, tool_response: {} }, { signal: signal() });
    expect(runner.calls).toHaveLength(0);
    expect(web.requests).toHaveLength(0);
  });

  test('allowManagedHooksOnly stops plugin hooks, except those of a plugin managed settings force-enable', async () => {
    const settings = createPolicyView([
      layerOf('managed', {
        allowManagedHooksOnly: true,
        enabledPlugins: { 'audit@acme-tools': true },
      }),
    ]);
    const { host, runner, web } = await hostOf({ settings, http: [{ status: 200, body: '{}' }] });
    const session = host.openSession(SESSION);
    await session.dispatch('PreToolUse', write, { signal: signal() });
    expect(runner.calls).toHaveLength(0);
    await session.dispatch('PostToolUse', { ...write, tool_response: {} }, { signal: signal() });
    expect(web.requests).toHaveLength(1);
  });

  test('a plugin settings turn off in enabledPlugins contributes no hook', async () => {
    const settings = createPolicyView([
      layerOf('user', { enabledPlugins: { 'audit@acme-tools': false } }),
    ]);
    const { host, web } = await hostOf({ settings });
    await host
      .openSession(SESSION)
      .dispatch('PostToolUse', { ...write, tool_response: {} }, { signal: signal() });
    expect(web.requests).toHaveLength(0);
  });

  test('the hooks of the settings files run beside the plugins', async () => {
    const settings = createPolicyView([
      layerOf('project', {
        hooks: {
          PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: './lint.sh' }] }],
        },
      }),
    ]);
    const { host, runner } = await hostOf({ settings, runs: [{}, {}] });
    await host.openSession(SESSION).dispatch('PreToolUse', write, { signal: signal() });
    expect(runner.calls.map((run) => run.spec.command).toSorted()).toEqual(
      ['/plugins/formatter@acme-tools/hooks/guard.sh', './lint.sh'].toSorted(),
    );
  });

  test('strictPluginOnlyCustomization stops the settings hooks and keeps the plugin ones', async () => {
    const settings = createPolicyView([
      layerOf('managed', { strictPluginOnlyCustomization: ['hooks'] }),
      layerOf('project', {
        hooks: {
          PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: './lint.sh' }] }],
        },
      }),
    ]);
    const { host, runner } = await hostOf({ settings, runs: [{}] });
    await host.openSession(SESSION).dispatch('PreToolUse', write, { signal: signal() });
    expect(runner.calls.map((run) => run.spec.command)).toEqual([
      '/plugins/formatter@acme-tools/hooks/guard.sh',
    ]);
  });
});

describe('dispatch is typed per event', () => {
  test('an input that lacks the fields of its event does not compile', async () => {
    const { host } = await hostOf();
    const session = host.openSession(SESSION);
    const compiles = (): unknown =>
      // @ts-expect-error a PreToolUse input carries tool_name, tool_input and tool_use_id
      session.dispatch('PreToolUse', { message: 'hi' }, { signal: signal() });
    expect(typeof compiles).toBe('function');
  });
});
