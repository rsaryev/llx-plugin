/** Fires one command hook whose script is a scripted reply: the plain shapes the docs' scripts print. */
import type { CommandResult } from '../../src/ports/index.ts';
import type { HookEvent } from '../../src/protocol/official.ts';
import { fire } from './hooks-fire.ts';
import { stage } from './hooks-output.ts';
import { command, entry } from './hooks-select.ts';
import type { RunnerReply } from './ports.ts';

/** A hook's own JSON as a script prints it. */
export const prints = (body: object): Partial<CommandResult> => ({
  exitCode: 0,
  stdout: JSON.stringify(body),
});

/** A command hook of `event` whose command is named, so the engine runs it beside another. */
export const hookNamed = (event: HookEvent, name: string) =>
  entry(event, { handler: command(`./${name}.sh`) });

/** The outcome of one hook of `event` whose script is `script`, fired with `facts` (the event's own when absent). */
export const runScript = (event: HookEvent, script: RunnerReply, facts?: object) =>
  fire(event, [entry(event)], [script], {
    output: stage,
    ...(facts === undefined ? {} : { facts }),
  }).then(({ outcome }) => outcome);

/** The outcome of one hook of `event` that exits with `exitCode` and prints `stderr`. */
export const exits = (event: HookEvent, exitCode: number, stderr: string, facts?: object) =>
  runScript(event, { exitCode, stderr }, facts);
