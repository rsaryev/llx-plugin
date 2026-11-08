import { z } from 'zod';
import { MOD_LIMITS } from '../../protocol/mods-limits.ts';
import type { CommandResult } from '../../ports/index.ts';
import type { ModsNamespaceApi } from '../types.ts';
import { call, isRecord, parse, type Deps } from './call.ts';
import { cutOutput } from './output-cut.ts';
import { workingDirectory } from './paths.ts';
import type { SpawnChunk } from './ports.ts';

/** The argument list: one program and its arguments, no shell (api.md, "Reach files, processes, and the network"). */
const argv = z.array(z.string()).min(1);
const init = z
  .looseObject({ cwd: z.string().optional(), timeoutMs: z.number().positive().optional() })
  .default({});
const event = z.looseObject({
  argv,
  init: z.looseObject({ cwd: z.string(), timeoutMs: z.number().positive() }),
});
const spawnEvent = z.looseObject({ argv, init: z.looseObject({ cwd: z.string() }) });

// The layer gate reads `process` and a dot as the global, so the namespace is named once, apart.
const NAMESPACE = 'process';
const RUN = `${NAMESPACE}.run` as const;
const SPAWN = `${NAMESPACE}.spawn` as const;
const LABEL_RUN = `$.${RUN}`;
const LABEL_SPAWN = `$.${SPAWN}`;

/** Resolves to `{ exitCode, stdout, stderr }` whatever the exit code; rejects if the program cannot start or is still running at the timeout. */
function answerOf(program: string, timeoutMs: number, result: CommandResult): unknown {
  if (result.startError !== undefined) throw new Error(`${program}: ${result.startError}`);
  if (result.timedOut) throw new Error(`${program} was still running after ${timeoutMs} ms`);
  if (result.exitCode === null) throw new Error(`${program} was stopped before it exited`);
  const stdout = cutOutput(result.stdout, MOD_LIMITS.outputBytes);
  const stderr = cutOutput(result.stderr, MOD_LIMITS.outputBytes);
  return {
    exitCode: result.exitCode,
    stdout: stdout.text,
    stderr: stderr.text,
    isStdoutTruncated: stdout.isTruncated,
    isStderrTruncated: stderr.isTruncated,
  };
}

async function run(deps: Deps, e: unknown): Promise<unknown> {
  const parsed = parse(LABEL_RUN, event, e);
  const [program = '', ...args] = parsed.argv;
  // Judgment: a longer timeout than the 10 minute maximum is the maximum.
  const timeoutMs = Math.min(parsed.init.timeoutMs, MOD_LIMITS.runTimeoutMaxMs);
  const result = await deps.ports.runner.run({
    spec: { form: 'exec', command: program, args },
    cwd: parsed.init.cwd,
    env: deps.ports.env.snapshot(),
    timeoutMs,
    signal: deps.signal,
  });
  return answerOf(program, timeoutMs, result);
}

async function inputOf(deps: Deps, label: string, args: readonly unknown[], timed: boolean) {
  const given = parse(label, init, args[1]);
  return {
    argv: parse(label, argv, args[0]),
    init: {
      cwd: given.cwd ?? (await workingDirectory(deps)),
      ...(timed ? { timeoutMs: given.timeoutMs ?? MOD_LIMITS.runTimeoutMs } : {}),
    },
  };
}

/** What comes before a refusing mod's reason: one of the two quoted strings once the command ran. */
function withheldPrefix(started: boolean, finished: boolean): string {
  if (!started) return `${LABEL_SPAWN}:`;
  return `${LABEL_SPAWN} ${finished ? 'ran' : 'started'}, and a plugin withheld its result:`;
}

/**
 * `$.process` `spawn`: the output streams (a hook on that event is an async generator). A hook
 * that refuses after the command ran makes the call reject with the quoted reason, and Claude Code
 * stops a command that is still running (api.md, "Reach files, processes, and the network").
 */
async function* spawn(deps: Deps, args: readonly unknown[]): AsyncGenerator<unknown, unknown> {
  const input = await inputOf(deps, LABEL_SPAWN, args, false);
  const context = deps.scope.current();
  let output: AsyncGenerator<SpawnChunk, unknown> | undefined;
  let finished = false;
  async function* core(e: unknown): AsyncGenerator<unknown, unknown> {
    const parsed = parse(LABEL_SPAWN, spawnEvent, e);
    output = deps.ports.spawner.spawn({
      argv: parsed.argv,
      cwd: parsed.init.cwd,
      env: deps.ports.env.snapshot(),
      signal: deps.signal,
    });
    const exit = yield* output;
    finished = true;
    return exit;
  }
  try {
    const result = yield* deps.chain.dispatchStream(SPAWN, input, {
      origin: context.origin,
      signal: deps.signal,
      report: deps.report,
      reentry: context.reentry,
      caller: context.origin,
      core,
    });
    if (isRecord(result) && typeof result.deny === 'string') {
      throw new Error(
        `${deps.plugin}: ${withheldPrefix(output !== undefined, finished)} ${result.deny}`,
      );
    }
    return result;
  } finally {
    if (!finished) await output?.return(undefined);
  }
}

export const processApi = (deps: Deps): ModsNamespaceApi<'process'> => ({
  run: async (...args) =>
    call(deps, RUN, await inputOf(deps, LABEL_RUN, args, true), (e) => run(deps, e)),
  spawn: (...args) => spawn(deps, args),
});
