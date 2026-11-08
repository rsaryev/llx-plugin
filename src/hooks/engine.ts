import type {
  Clock,
  CommandRunner,
  Environment,
  HttpClient,
  Locations,
  McpCaller,
  ModelRunner,
  ScratchFiles,
  ShellKind,
} from '../ports/index.ts';
import type { HookEvent } from '../protocol/official.ts';
import type { RunPorts } from './handlers/context.ts';
import type { HookRegistry, ModelCatalog } from './contracts.ts';
import { dispatchEvent, type DispatchConfig } from './dispatch.ts';
import { runHandler } from './handlers/registry.ts';
import { buildHookInput } from './input/build.ts';
import type { DispatchRequest, HookOutcome } from './outcome.ts';
import { createOutputStage } from './output/stage.ts';
import type { IfEvaluator } from './select/if-guard.ts';
import { selectHandlers } from './select/select.ts';
import { createStopBlockCap, type StopBlockCap } from './verdict/stop-block-cap.ts';
import type { HookObserver, OutputStage } from './verdict/types.ts';

/** The ports the engine runs handlers through: each handler type needs its own (docs/API.md, "Ports"). */
export interface HookPorts {
  readonly commands: CommandRunner;
  readonly locations: Locations;
  readonly environment: Environment;
  /** `http` hooks. */
  readonly http?: HttpClient;
  /** `mcp_tool` hooks. */
  readonly mcp?: McpCaller;
  /** `prompt` and `agent` hooks. */
  readonly models?: ModelRunner;
  /** Where a hook's text over the 10,000-character cap is saved; without it such text is cut. */
  readonly scratch?: ScratchFiles;
  readonly clock?: Clock;
  readonly observer?: HookObserver;
  readonly modelCatalog?: ModelCatalog;
}

/** The output stage's one option: where to save text over the cap. */
const scratchOf = (ports: HookPorts) =>
  ports.scratch === undefined ? {} : { scratch: ports.scratch };

/** What the engine cannot read off a port: the machine, and the output stage. */
export interface HookEngineOptions {
  /** Reads the JSON output of each hook and merges them; by default the real one (`createOutputStage`). */
  readonly output?: OutputStage;
  /** Reads a handler's `if`; without one a handler with `if` runs and a warning says why. */
  readonly ifEvaluator?: IfEvaluator;
  readonly windows?: boolean;
  /** What a command hook with no `shell` field runs in: `bash`, or `powershell` on Windows without Git Bash. */
  readonly defaultShell?: ShellKind;
  /**
   * How a bash shell-form hook carries a path variable (`resolveHookCommand`'s `shellPaths`):
   * `environment-reference` keeps `${CLAUDE_PROJECT_DIR}` for the shell to read from the hook's
   * environment, so a folder name is never parsed as shell. Judgment (spec/judgments.md).
   */
  readonly shellPaths?: DispatchConfig['shellPaths'];
  readonly startDirectory?: string;
  readonly tempDirectory?: string;
  readonly userConfigOf?: DispatchConfig['userConfigOf'];
  readonly httpPolicy?: DispatchConfig['httpPolicy'];
  /** The host process's id, exported as `CLAUDE_PID` to command hooks. */
  readonly processId?: DispatchConfig['processId'];
  /** The `env` blocks of the settings files, resolved (`resolveSettingsEnv`). */
  readonly settingsEnv?: DispatchConfig['settingsEnv'];
  /** `CLAUDE_ENV_FILE` for the events that have one (`createEnvFiles`). */
  readonly envFiles?: DispatchConfig['envFiles'];
  /**
   * The counter of consecutive Stop blocks (`createStopBlockCap`). By default each engine has its
   * own, which is gone with it; a host that builds an engine per run passes one that outlives the
   * runs, owns its lifetime and calls its `reset` when the session ends.
   */
  readonly stopCap?: StopBlockCap;
  /**
   * Plugin command hooks first check that their plugin's directory exists, so a plugin that is gone
   * from disk fails with the documented notice. On by default; a host that never re-reads its
   * plugins mid-session and wants no lookup per hook run sets `false`.
   */
  readonly checkPluginDirectories?: DispatchConfig['checkPluginDirectories'];
}

export interface HookEngine {
  dispatch<E extends HookEvent>(
    registry: HookRegistry,
    request: DispatchRequest<E>,
  ): Promise<HookOutcome<E>>;
}

/** The ports the run stage reads: only the ones the host gave. */
const runPortsOf = (ports: HookPorts): RunPorts => ({
  runner: ports.commands,
  locations: ports.locations,
  environment: ports.environment,
  ...(ports.observer === undefined ? {} : { observer: ports.observer }),
  ...(ports.http === undefined ? {} : { http: ports.http }),
  ...(ports.mcp === undefined ? {} : { mcp: ports.mcp }),
  ...(ports.models === undefined ? {} : { models: ports.models }),
  ...(ports.clock === undefined ? {} : { clock: ports.clock }),
});

/** What the host sets about its machine; each is passed on only when set. */
const hostOf = (options: HookEngineOptions) => ({
  ...(options.shellPaths === undefined ? {} : { shellPaths: options.shellPaths }),
  ...(options.startDirectory === undefined ? {} : { startDirectory: options.startDirectory }),
  ...(options.tempDirectory === undefined ? {} : { tempDirectory: options.tempDirectory }),
  ...(options.userConfigOf === undefined ? {} : { userConfigOf: options.userConfigOf }),
  ...(options.httpPolicy === undefined ? {} : { httpPolicy: options.httpPolicy }),
  ...(options.processId === undefined ? {} : { processId: options.processId }),
  ...(options.settingsEnv === undefined ? {} : { settingsEnv: options.settingsEnv }),
  ...(options.envFiles === undefined ? {} : { envFiles: options.envFiles }),
  ...(options.checkPluginDirectories === false ? {} : { checkPluginDirectories: true }),
});

/** The engine over the real stages: select, build, run through the ports, read, merge. */
export function createHookEngine(ports: HookPorts, options: HookEngineOptions = {}): HookEngine {
  const config: DispatchConfig = {
    stages: {
      select: selectHandlers,
      build: buildHookInput,
      run: runHandler,
      output: options.output ?? createOutputStage(scratchOf(ports)),
    },
    ports: runPortsOf(ports),
    stopCap: options.stopCap ?? createStopBlockCap(),
    windows: options.windows ?? false,
    defaultShell: options.defaultShell ?? 'bash',
    ...(ports.observer === undefined ? {} : { observer: ports.observer }),
    ...(ports.modelCatalog === undefined ? {} : { modelCatalog: ports.modelCatalog }),
    ...(options.ifEvaluator === undefined ? {} : { ifEvaluator: options.ifEvaluator }),
    ...hostOf(options),
  };
  return { dispatch: (registry, request) => dispatchEvent(registry, request, config) };
}
