import { z } from 'zod';
import { MOD_LIMITS } from '../../protocol/mods-limits.ts';
import type { CommandResult } from '../../ports/index.ts';
import type { ModsNamespaceApi } from '../types.ts';
import { call, parse, type Deps } from './call.ts';
import { cutOutput } from './output-cut.ts';
import { absolutePath, workingDirectory } from './paths.ts';
import type { SpawnChunk } from './ports.ts';
import { isRecord } from '../../protocol/is-record.ts';

/** The argument list: one program and its arguments, no shell (api.md, "Reach files, processes, and the network"). */
const argv = z.array(z.string()).min(1);
const env = z.record(z.string(), z.string());
/** `ProcessRunInit` (claude-code/index.d.ts:8549): `cwd`, `env` over the host's, `stdin`, `timeoutMs`. */
const init = z
  .looseObject({
    cwd: z.string().optional(),
    env: env.optional(),
    stdin: z.string().optional(),
    timeoutMs: z.number().positive().optional(),
  })
  .default({});
const event = z.looseObject({
  argv,
  init: z.looseObject({
    cwd: z.string(),
    env: env.optional(),
    stdin: z.string().optional(),
    timeoutMs: z.number().positive(),
  }),
});
/** `$.process.spawn({ argv, cwd?, env?, input? })` (:8636): the request, and the event its hooks see. */
const spawnRequest = z.looseObject({
  argv,
  cwd: z.string().optional(),
  env: env.optional(),
  input: z.string().optional(),
});
const spawnEvent = spawnRequest.extend({ cwd: z.string() });

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
  const stdout = cutOutput(result.stdout, MOD_LIMITS.outputBytes);
  const stderr = cutOutput(result.stderr, MOD_LIMITS.outputBytes);
  return {
    // "a child ended by a signal reads as 1" (claude-code/index.d.ts:8578).
    exitCode: result.exitCode ?? 1,
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
    env: { ...deps.ports.env.snapshot(), ...parsed.init.env },
    ...(parsed.init.stdin === undefined ? {} : { stdin: parsed.init.stdin }),
    timeoutMs,
    signal: deps.signal,
  });
  return answerOf(program, timeoutMs, result);
}

/** A child's working directory: relative to the session's or absolute, the session's when absent (:8642). */
const cwdOf = async (deps: Deps, cwd: string | undefined): Promise<string> =>
  cwd === undefined ? workingDirectory(deps) : absolutePath(deps, cwd);

async function runInput(deps: Deps, args: readonly unknown[]) {
  const given = parse(LABEL_RUN, init, args[1]);
  return {
    argv: parse(LABEL_RUN, argv, args[0]),
    init: {
      ...given,
      cwd: await cwdOf(deps, given.cwd),
      timeoutMs: given.timeoutMs ?? MOD_LIMITS.runTimeoutMs,
    },
  };
}

/** How a spawned child ended, `{ code, signal }` (:8663), from what the host's spawner returned. */
const endOf = (exit: { readonly exitCode: number | null; readonly signal?: string | null }) => ({
  code: exit.exitCode,
  signal: exit.signal ?? null,
});

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
  const request = parse(LABEL_SPAWN, spawnRequest, args[0]);
  const input = { ...request, cwd: await cwdOf(deps, request.cwd) };
  const context = deps.scope.current();
  let output: AsyncGenerator<SpawnChunk, unknown> | undefined;
  let finished = false;
  async function* core(e: unknown): AsyncGenerator<unknown, unknown> {
    const parsed = parse(LABEL_SPAWN, spawnEvent, e);
    const spawned = deps.ports.spawner.spawn({
      argv: parsed.argv,
      cwd: parsed.cwd,
      env: { ...deps.ports.env.snapshot(), ...parsed.env },
      ...(parsed.input === undefined ? {} : { input: parsed.input }),
      signal: deps.signal,
    });
    output = spawned;
    const exit = yield* spawned;
    finished = true;
    return endOf(exit);
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
  run: async (...args) => call(deps, RUN, await runInput(deps, args), (e) => run(deps, e)),
  spawn: (...args) => spawn(deps, args),
});
