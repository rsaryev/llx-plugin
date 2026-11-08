/** Helpers for the tests of the command handler and the run stage (hooks/handlers). */
import type { RegisteredHandler } from '../../src/hooks/contracts.ts';
import type { HandlerEntry, RunContext, RunPorts } from '../../src/hooks/handlers/index.ts';
import { planTimeouts } from '../../src/hooks/handlers/index.ts';
import type {
  CommandResult,
  CommandRun,
  CommandRunner,
  Environment,
  Locations,
} from '../../src/ports/index.ts';
import type { HookHandlerOf } from '../../src/protocol/hook-config.ts';
import type { HookEvent } from '../../src/protocol/official.ts';
import { entry, pluginSource } from './hooks-select.ts';
import { fakeEnvironment, locations } from './ports.ts';

/** A command handler as a settings file declares it. */
export const settingsCommand = (
  hook: Omit<HookHandlerOf<'command'>, 'type'>,
  event: HookEvent = 'PostToolUse',
): HandlerEntry<'command'> => ({
  ...entry(event),
  handler: { type: 'command', ...hook },
});

/** A command handler of the plugin `formatter@acme-tools`. */
export const pluginCommand = (
  hook: Omit<HookHandlerOf<'command'>, 'type'>,
  event: HookEvent = 'PostToolUse',
): HandlerEntry<'command'> => ({
  ...entry(event, { source: pluginSource('formatter'), pluginId: 'formatter@acme-tools' }),
  handler: { type: 'command', ...hook },
});

export interface ContextOptions {
  readonly runner: CommandRunner;
  readonly locations?: Locations;
  readonly environment?: Environment;
  readonly cwd?: string;
  readonly input?: string;
  readonly windows?: boolean;
  readonly defaultShell?: RunContext['defaultShell'];
  readonly observer?: RunPorts['observer'];
  readonly userConfigOf?: RunContext['userConfigOf'];
  readonly startDirectory?: string;
  readonly tempDirectory?: string;
  readonly timeouts?: RunContext['timeouts'];
}

/** A run context over the fakes: POSIX paths, `bash`, an empty environment, input `{}`. */
export function runContext(options: ContextOptions): RunContext {
  return {
    ports: {
      runner: options.runner,
      locations: options.locations ?? locations(),
      environment: options.environment ?? fakeEnvironment(),
      ...(options.observer === undefined ? {} : { observer: options.observer }),
    },
    input: options.input ?? '{}',
    cwd: options.cwd ?? '/work/app',
    windows: options.windows ?? false,
    defaultShell: options.defaultShell ?? 'bash',
    timeouts: options.timeouts ?? {},
    signal: new AbortController().signal,
    ...(options.userConfigOf === undefined ? {} : { userConfigOf: options.userConfigOf }),
    ...(options.startDirectory === undefined ? {} : { startDirectory: options.startDirectory }),
    ...(options.tempDirectory === undefined ? {} : { tempDirectory: options.tempDirectory }),
  };
}

/** The timeout plan of one handler as the engine would build it for its event. */
export const planFor = (
  handler: RegisteredHandler,
  environment: Environment = fakeEnvironment(),
  others: readonly RegisteredHandler[] = [],
): RunContext['timeouts'] => planTimeouts(handler.event, [handler, ...others], environment);

/**
 * A runner whose process ends when the test says so: `runs` lists the requests it was asked for,
 * `finish(index, result)` ends one. Proves a background hook returns before its process ends.
 */
export function pendingRunner(): CommandRunner & {
  readonly calls: CommandRun[];
  finish(index: number, result?: Partial<CommandResult>): void;
} {
  const calls: CommandRun[] = [];
  const resolvers: ((result: CommandResult) => void)[] = [];
  return {
    calls,
    run: (run) => {
      calls.push(run);
      return new Promise((resolve) => resolvers.push(resolve));
    },
    finish: (index, result = {}) =>
      resolvers[index]?.({ exitCode: 0, stdout: '', stderr: '', timedOut: false, ...result }),
  };
}
