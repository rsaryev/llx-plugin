import type { ModHostPorts } from '../../src/mods/api/index.ts';

/**
 * Host ports that answer every call as a host that has the effect would, in the shapes the ports
 * take: what `resultDifferences` reads each call's result over, so a result the kit builds from
 * the host's answer is checked against its declaration (AGENTS.md, E2a).
 */

const usage = {
  input_tokens: 1,
  output_tokens: 1,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
};
const answered = { isAnswered: true, text: 'ok', usage } as const;
const resolved =
  <T>(value: T) =>
  (): Promise<T> =>
    Promise.resolve(value);
const done = resolved(undefined);

export const HOST_ANSWERS: Partial<ModHostPorts> = {
  theme: { drawn: resolved({ isDrawn: true }), changed: () => undefined },
  models: { complete: resolved(answered), fork: resolved(answered), classify: resolved('bug') },
  audio: { play: done, speak: done },
  mcp: {
    ensureConnected: resolved('connected'),
    callTool: resolved({ isError: false, text: 'ok' }),
  },
  session: {
    messages: resolved([{ role: 'user', text: 'hi', toolUses: [] }]),
    cwd: resolved('/work'),
    root: resolved('/work'),
    model: resolved('claude-opus'),
    turns: resolved(1),
    id: resolved('session-1'),
    repo: resolved(null),
    surfaces: resolved(['terminal']),
    usage: resolved({
      startedAt: 0,
      context: { tokens: 1, window: 200_000, percent: 0 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 1 }],
    }),
    version: resolved('2.1.321'),
    compact: resolved({ messages: [] }),
    send: resolved({ isDelivered: true }),
    append: (row) => Promise.resolve({ message: row.message, uuid: 'row-1' }),
    authorize: resolved(null),
  },
  prompts: {
    submit: resolved({}),
    read: resolved({ text: '', cursor: 0 }),
    fill: resolved({ isFilled: true, text: 'draft', cursor: 5 }),
    suggest: resolved({ isShown: true }),
    compose: resolved([]),
  },
  tools: { call: resolved({ result: 'ok' }), check: resolved({ decision: 'allow' }) },
  commands: { builtIns: () => [], run: resolved({ text: 'ok' }) },
  turns: { abort: done },
  config: { list: resolved([]), set: done },
  telemetry: { log: done, mark: done },
  account: { identity: resolved({ kind: 'claude.ai', isVerified: true }) },
  promptBox: {
    paint: resolved({ isPainted: true, text: 'draft', cursor: 5 }),
    media: resolved({ type: 'image', mediaType: 'image/png', base64: 'AA==', size: 1 }),
  },
  notifications: { cancel: resolved({ isSent: true }) },
  agents: { spawn: resolved({ agentId: 'agent-1', model: 'haiku' }), list: resolved([]) },
  fs: {
    read: resolved({ text: 'x', bytes: 1 }),
    write: done,
    list: resolved([]),
    stat: resolved({ kind: 'file', size: 1, isLink: false }),
    exists: resolved(true),
    ancestors: resolved([]),
  },
  store: { read: resolved({}), write: done },
  fetcher: { request: resolved({ status: 200, headers: {}, text: 'ok' }) },
  runner: { run: resolved({ exitCode: 0, stdout: '', stderr: '', timedOut: false }) },
  spawner: {
    // oxlint-disable-next-line require-yield -- the child writes nothing
    spawn: async function* () {
      return { exitCode: 0 };
    },
  },
};
