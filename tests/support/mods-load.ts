import type { PluginFiles } from '../../src/ports/index.ts';
import { ESM_FORMAT } from '../../src/mods/load/compile-output.ts';
import type { DenyRuleChecker, ModCompiler, ModRuntime } from '../../src/mods/ports.ts';
import {
  createModsHost,
  type ModCandidate,
  type ModPlugin,
  type ModsHost,
  type ModsHostOptions,
  type ModsPolicyInput,
} from '../../src/mods/load/index.ts';
import type { HookReport } from '../../src/mods/types.ts';
import {
  fakeModInterface,
  fakePorts,
  inlineRuntime,
  moduleText,
  type RegisterFunction,
} from '../../src/testing/mods/index.ts';
import { memoryFiles } from './ports.ts';

/** The settings a session with no policy has: no managed settings, an API key, a posix machine. */
export function policy(overrides: Partial<ModsPolicyInput> = {}): ModsPolicyInput {
  return {
    user: {},
    credential: 'api-key',
    env: {},
    platform: 'posix',
    flags: { pluginDirs: [] },
    ...overrides,
  };
}

/** A managed-settings machine: managed settings with `keys`, the way `/etc/claude-code/managed-settings.json` would hold them. */
export const managed = (keys: NonNullable<ModsPolicyInput['managed']> = {}): ModsPolicyInput =>
  policy({ managed: keys });

/** An installed plugin the user brought (a marketplace the user added). */
export const installed = (name: string, marketplace = 'market'): ModCandidate => ({
  id: `${name}@${marketplace}`,
  name,
  isBuiltin: false,
  dependencies: [],
});

/** A plugin loaded with `--plugin-dir`: its id ends `@inline`. */
export const inline = (name: string): ModCandidate => installed(name, 'inline');

/** A plugin that counts as the organization's: enabled in managed settings, from a directory marketplace, loaded in place. */
export const organizations = (name: string, marketplace = 'acme-tools'): ModCandidate => ({
  ...installed(name, marketplace),
  managed: {
    isEnabled: true,
    marketplaceDirectory: '/opt/acme/claude-plugins',
    isLoadedInPlace: true,
  },
});

const MANIFEST = (name: string) => JSON.stringify({ name, version: '0.1.0' });
const HOOKS = JSON.stringify({ modules: ['./register.js'] });

/** The folder of a mod whose hooks module is `register`. */
function modFolder(
  name: string,
  register: RegisterFunction,
  extra: Record<string, string> = {},
): PluginFiles {
  return memoryFiles({
    '.claude-plugin/plugin.json': MANIFEST(name),
    'hooks/hooks.json': HOOKS,
    'hooks/register.js': moduleText(register),
    ...extra,
  });
}

/** A compiler that hands the module's own text back: the test's modules are already JavaScript. */
export const textCompiler: ModCompiler = {
  compile: async ({ files, entry }) => {
    const code = await files.readText(entry);
    return code === undefined ? { issues: [] } : { run: { code, format: ESM_FORMAT }, issues: [] };
  },
};

/** A runtime that runs, for each plugin name, the `register` function a test gave it. */
export function runtimeOf(registers: Readonly<Record<string, RegisterFunction>>): ModRuntime {
  return {
    load: (input, signal) => {
      const register = registers[input.plugin];
      if (!register) return Promise.resolve({ issues: [] });
      return inlineRuntime(register).load(input, signal);
    },
  };
}

const allowAll: DenyRuleChecker = { verdict: () => Promise.resolve('none') };

export interface Session {
  readonly host: ModsHost;
  readonly debug: string[];
  readonly reports: HookReport[];
}

/** A host over fake ports, with `mods` loaded by `load(...)`. */
export function session(
  registers: Readonly<Record<string, RegisterFunction>>,
  options: Partial<ModsHostOptions> = {},
): Session {
  const debug: string[] = [];
  const reports: HookReport[] = [];
  const host = createModsHost({
    ports: fakePorts().ports,
    iface: fakeModInterface(),
    runtime: runtimeOf(registers),
    compiler: textCompiler,
    policy: policy(),
    deny: allowAll,
    debug: (line) => debug.push(line),
    report: (report) => reports.push(report),
    ...options,
  });
  return { host, debug, reports };
}

/** A plugin for `host.load`: the candidate and the folder of a mod whose module is `register`. */
export function modPlugin(candidate: ModCandidate, register: RegisterFunction): ModPlugin {
  return { candidate, files: modFolder(candidate.name, register) };
}

/** The `on` of a test's `register`: a name, an optional filter and a hook, all loosely typed. */
export type LooseOn = (name: string, ...rest: unknown[]) => { catch(handler: unknown): void };

/**
 * A `register` written with a loosely typed `on`, as a test needs it. The one cast: `RegisterFunction`
 * types each hook by its event, and a test registers hooks of many events through one `on`.
 */
export const registerOf = (register: (on: LooseOn) => void | Promise<void>): RegisterFunction =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see the doc comment: only the type of `on` differs, the function is the same
  register as unknown as RegisterFunction;
