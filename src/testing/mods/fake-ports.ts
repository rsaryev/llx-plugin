import type { Clock } from '../../ports/index.ts';
import type { ModHostPorts } from '../../mods/api/index.ts';
import type { ModInterface } from '../../mods/ui/index.ts';

/**
 * Fakes of every port a mod's `$` reaches, for a host's own tests and for the test kit (plugins/mods/
 * test.md, "Stub what Claude Code would answer": no model, store or tool runs in a test, and a call
 * nothing answers fails with `no implementation for <name>`). Each method rejects until a test gives
 * it behaviour; `session.append` is answered by the kit itself (it records the row).
 */

/** The text a call nobody answers fails with. */
export const noImplementation = (name: string): string => `no implementation for ${name}`;

// The layer gate reads `process` and a dot in code as the global, so the namespace is named once, apart.
const PROCESS = 'process';

const missing = (name: string) => (): Promise<never> =>
  Promise.reject(new Error(noImplementation(name)));

/** A clock that never moves and fires nothing: the chain's time limits never trip in a test. */
export function idleClock(): Clock {
  return {
    now: () => 0,
    setTimer: () => () => undefined,
    sleep: (_ms, signal) =>
      new Promise<void>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
      }),
  };
}

export interface FakePorts {
  readonly ports: ModHostPorts;
  /** The rows mods appended with `$.session.append`, oldest first. */
  readonly appended: unknown[];
}

/** `overrides` replaces whole ports; the rest answer `no implementation for <name>`. */
export function fakePorts(overrides: Partial<ModHostPorts> = {}): FakePorts {
  const appended: unknown[] = [];
  const ports: ModHostPorts = {
    clock: idleClock(),
    locations: {
      homeDir: () => '/home/user',
      projectDir: () => '/work',
      pluginRoot: (id) => `/plugins/${id}`,
      pluginData: (id) => Promise.resolve(`/data/${id}`),
      joinPath: (base, relative) => `${base}/${relative}`,
      existingDirectory: () => Promise.resolve(undefined),
    },
    fs: {
      read: missing('fs.read'),
      write: missing('fs.write'),
      list: missing('fs.list'),
      stat: missing('fs.stat'),
      exists: missing('fs.exists'),
      ancestors: missing('fs.ancestors'),
    },
    runner: { run: missing(`${PROCESS}.run`) },
    spawner: {
      // oxlint-disable-next-line require-yield -- the spawn fails before it yields a chunk
      spawn: async function* () {
        await missing(`${PROCESS}.spawn`)();
        return { exitCode: null };
      },
    },
    fetcher: { request: missing('http.fetch') },
    mcp: { ensureConnected: missing('mcp.connect'), callTool: missing('mcp.call') },
    env: { get: () => undefined, set: () => undefined, snapshot: () => ({}) },
    // Every `$.store` call reads first, so an unanswered one names `store.get` whichever method it was.
    store: { read: missing('store.get'), write: missing('store.set') },
    models: {
      complete: missing('model.complete'),
      fork: missing('model.fork'),
      classify: missing('model.classify'),
    },
    session: {
      messages: missing('session.messages'),
      cwd: () => Promise.resolve('/work'),
      root: () => Promise.resolve('/work'),
      model: missing('session.model'),
      turns: missing('session.turns'),
      id: missing('session.id'),
      repo: missing('session.repo'),
      surfaces: missing('session.surfaces'),
      usage: missing('session.usage'),
      version: missing('session.version'),
      compact: missing('session.compact'),
      send: missing('session.send'),
      append: (row) => {
        appended.push(row);
        return Promise.resolve();
      },
      authorize: missing('session.authorize'),
    },
    prompts: {
      submit: missing('prompt.submit'),
      read: missing('prompt.read'),
      fill: missing('prompt.fill'),
      suggest: missing('prompt.suggest'),
      compose: missing('prompt.compose'),
    },
    agents: { spawn: missing('agent.spawn'), list: missing('agent.list') },
    commands: {
      builtIns: () => ['help', 'clear', 'plugin', 'reload-plugins'],
      run: missing('command.run'),
    },
    tools: { call: missing('tool.call'), check: missing('tool.check') },
    turns: { abort: missing('turn.abort') },
    config: { list: missing('config.list'), set: missing('config.set') },
    settings: { layers: missing('settings.read'), merged: () => ({}) },
    audio: { play: missing('audio.play'), speak: missing('audio.speak') },
    telemetry: { log: missing('telemetry.log'), mark: missing('telemetry.mark') },
    ...overrides,
  };
  return { ports, appended };
}

/** A host interface that draws nothing: every call answers at once, and redraws are counted. */
export function fakeModInterface(overrides: Partial<ModInterface> = {}): ModInterface {
  return {
    surface: () => 'terminal',
    viewport: () => ({ columns: 120, rows: 40, isFullscreen: true }),
    renderer: () => 'fullscreen',
    origin: () => 'mod',
    redraw: () => undefined,
    isTerminalVisible: () => false,
    status: () => undefined,
    log: () => undefined,
    notify: () => Promise.resolve({ isSent: false, reason: 'no-surface' }),
    ask: missing('ui.ask'),
    copy: () => Promise.resolve({ isCopied: false }),
    selection: () => Promise.resolve(undefined),
    notice: () => Promise.resolve(undefined),
    blit: () => Promise.resolve(undefined),
    focus: () => Promise.resolve(undefined),
    scroll: () => Promise.resolve(undefined),
    ...overrides,
  };
}
