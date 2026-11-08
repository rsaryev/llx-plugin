import { readHooksJsonModules } from '../../format/mod-files.ts';
import type { PluginFiles } from '../../ports/index.ts';
import type { ModCompiler, ModRuntime } from '../../mods/ports.ts';
import {
  createModsHost,
  type ModCandidate,
  type ModPlugin,
  type ModsHost,
  type ModsPolicyInput,
} from '../../mods/load/index.ts';
import type { HookReport, RegisteredHook } from '../../mods/types.ts';
import type { ModHostPorts } from '../../mods/api/index.ts';
import { fakeModInterface, fakePorts, idleClock, noImplementation } from './fake-ports.ts';
import { unansweredReason } from './fallbacks.ts';
import {
  inlineFolder,
  withInlineCompiler,
  withInlineRuntime,
  type InlineMod,
} from './inline-files.ts';
import type { RegisterFunction } from './inline-runtime.ts';
import type { MockClock } from './mock-clock.ts';
import { createStubBook, isKnownEvent, noting, type StubBook, type StubHook } from './stubs.ts';

/**
 * One test's world (plugins/mods/test.md, "Write a test"): a mods host over fake ports, with the
 * mod under test and the inline mods of the test loaded at the first call on `$`, the stubs the test
 * registered ahead of them, and a clock the test may take over with `mock.clock`.
 */

export type TierName = 'user' | NonNullable<InlineMod['tier']>;

export interface WorldOptions {
  /** The folder of the plugin being tested. */
  readonly files: PluginFiles;
  readonly compiler: ModCompiler;
  readonly runtime: ModRuntime;
  /** Where the mod under test runs (`tier()` of the test file). */
  readonly tier: TierName;
  readonly plugins: readonly InlineMod[];
}

export interface World {
  readonly stubs: StubBook;
  /** `$` of the test, set once it is built; the stubs receive it. */
  claude: unknown;
  host(): ModsHost;
  readonly reports: HookReport[];
  readonly failures: string[];
  /** The rows mods appended with `$.session.append`. */
  readonly appended: readonly unknown[];
  /** True when a mod asked for a redraw since the last one: the mount of the test draws again before it answers. */
  needsRedraw: boolean;
  /** True from the test's first call on `$`: no stub can be registered after it. */
  hasStarted(): boolean;
  stub(name: string, hook: StubHook): void;
  /** Gives the test a clock it moves: `$.clock` is answered from it from now on. */
  takeClock(clock: MockClock): void;
  /** Loads the mods, once; every later call waits for the same load or throws what it threw. */
  ensure(): Promise<void>;
  /** Ends the test: unloads the mods and drops what they scheduled. */
  dispose(): Promise<void>;
  /** Claude Code's own answer to `name`: what the stubs give. */
  answer(name: string, e: unknown): ReturnType<StubBook['answer']>;
}

const CLOCK_CALLS = ['clock.now', 'clock.sleep', 'clock.after', 'clock.every'] as const;

/** The mod under test's name: the manifest's, or `mod`. */
async function nameOf(files: PluginFiles): Promise<string> {
  const text = await files.readText('.claude-plugin/plugin.json');
  try {
    const name: unknown = text === undefined ? undefined : Reflect.get(JSON.parse(text), 'name');
    return typeof name === 'string' ? name : 'mod';
  } catch {
    return 'mod';
  }
}

/** Whether `hooks/hooks.json` names a hooks module: parsed, so a file that holds only settings hooks is no mod. */
async function hasModule(files: PluginFiles): Promise<boolean> {
  const text = await files.readText('hooks/hooks.json');
  try {
    return text !== undefined && readHooksJsonModules(JSON.parse(text)).entry !== undefined;
  } catch {
    return false;
  }
}

/** The candidate of a mod the test loads: where it runs decides how policy sees it. */
function candidate(name: string, tier: TierName): ModCandidate {
  const base = { id: `${name}@test`, name, isBuiltin: false, dependencies: [] };
  if (tier === 'builtin') return { ...base, isBuiltin: true, id: `${name}@builtin` };
  if (tier === 'user') return base;
  return {
    ...base,
    managed: { isEnabled: true, marketplaceDirectory: '/test', isLoadedInPlace: true },
  };
}

/** Policy that puts each mod in its tier; with a mod in `prepend` or `append` the guard is left out (an empty `prependPlugins`). */
function policyFor(
  mods: readonly { readonly name: string; readonly tier: TierName }[],
): ModsPolicyInput {
  const ids = (tier: TierName) =>
    mods.filter((mod) => mod.tier === tier).map((mod) => `${mod.name}@test`);
  const placed = ids('prepend').length + ids('append').length > 0;
  return {
    user: {},
    credential: 'api-key',
    env: {},
    platform: 'posix',
    flags: { pluginDirs: [] },
    ...(placed
      ? { managed: { prependPlugins: ids('prepend'), appendPlugins: ids('append') } }
      : {}),
  };
}

/** The clock port: idle until the test takes a clock with `mock.clock`, then that clock. */
const movableClock = (current: () => MockClock | undefined): ModHostPorts['clock'] => ({
  now: () => (current() ?? idleClock()).now(),
  setTimer: (fire, ms) => (current() ?? idleClock()).setTimer(fire, ms),
  sleep: (ms, signal) => (current() ?? idleClock()).sleep(ms, signal),
});

/** Until the test takes the clock, a call on `$.clock` fails like any call nobody answers. */
const clockFallbacks = (isMocked: () => boolean): readonly RegisteredHook[] =>
  CLOCK_CALLS.map((name) => ({
    event: name,
    isGenerator: false,
    run: (_api, e, next) => (isMocked() ? next(e) : { deny: noImplementation(name) }),
  }));

/** A mod the world loads: the one under test, or an inline one with its `register`. */
interface PlacedMod {
  readonly name: string;
  readonly tier: TierName;
  readonly files: PluginFiles;
  readonly register?: RegisterFunction;
}

/** The mod under test first, when the folder holds a hooks module, then the inline mods. */
async function placedMods(options: WorldOptions): Promise<readonly PlacedMod[]> {
  const own: readonly PlacedMod[] = (await hasModule(options.files))
    ? [{ name: await nameOf(options.files), tier: options.tier, files: options.files }]
    : [];
  return [
    ...own,
    ...options.plugins.map((mod): PlacedMod => ({
      name: mod.name,
      tier: mod.tier ?? 'user',
      files: inlineFolder(mod),
      register: mod.register,
    })),
  ];
}

const notStarted = (): never => {
  throw new Error('the test has not called $ yet');
};

export function createWorld(options: WorldOptions): World {
  const fake = fakePorts();
  let mock: MockClock | undefined;
  let started = false;
  let loading: Promise<void> | undefined;
  let host: ModsHost | undefined;
  const reports: HookReport[] = [];
  const failures: string[] = [];
  const stubs = createStubBook();
  const world: World = {
    stubs,
    claude: undefined,
    needsRedraw: false,
    host: () => host ?? notStarted(),
    reports,
    failures,
    appended: fake.appended,
    hasStarted: () => started,
    stub: (name, hook) => {
      if (isKnownEvent(name))
        stubs.add(
          name,
          noting(name, hook, (message) => failures.push(message)),
        );
    },
    takeClock: (clock) => {
      mock = clock;
    },
    ensure: () => {
      started = true;
      loading ??= load();
      return loading;
    },
    answer: (name, e) => stubs.answer(name, e, world.claude),
    dispose: async () => {
      await host?.dispose();
    },
  };

  async function load(): Promise<void> {
    const placed = await placedMods(options);
    const inline = placed.filter((mod) => mod.register !== undefined);
    const registers = new Map<string, RegisterFunction>(
      inline.flatMap((mod) => (mod.register ? [[mod.name, mod.register] as const] : [])),
    );
    host = createModsHost({
      ports: { ...fake.ports, clock: movableClock(() => mock) },
      iface: fakeModInterface({
        redraw: () => {
          world.needsRedraw = true;
        },
      }),
      runtime: withInlineRuntime(options.runtime, registers),
      compiler: withInlineCompiler(options.compiler, new Set(inline.map((mod) => mod.files))),
      policy: policyFor(placed),
      deny: { verdict: () => Promise.resolve('none') },
      unanswered: unansweredReason,
      // "session.start doesn't run by itself" in a test: the test fires it (test.md, "Follow the test kit's rules").
      firesSessionStart: false,
      report: (report) => reports.push(report),
    });
    await host.registerBuiltIn(
      'test-stubs',
      'prepend',
      stubs.hooks(() => world.claude),
    );
    await host.registerBuiltIn(
      'test-clock',
      'prepend',
      clockFallbacks(() => mock !== undefined),
    );
    const plugins: ModPlugin[] = placed.map((mod) => ({
      candidate: candidate(mod.name, mod.tier),
      files: mod.files,
    }));
    const report = await host.load(plugins);
    if (report.lines.length > 0) throw new Error(report.lines.join('\n'));
  }
  return world;
}
