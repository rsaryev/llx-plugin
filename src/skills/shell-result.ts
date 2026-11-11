import { prefixWithinBytes } from '../format/utf8.ts';
import type { SkillShell } from '../format/skill-types.ts';
import type { ScratchFiles } from '../ports/index.ts';
import {
  backgroundCwdNote,
  bashOutputLimits,
  classifyBashExit,
  classifyPowerShellExit,
  effectiveBashTimeout,
  movedByTimeoutNotice,
  shouldMoveToBackground,
  windowBashOutput,
} from '../rules/index.ts';
import type { SkillCommandResult } from './shell-ports.ts';

/**
 * What one finished injected command becomes (skills.md, "How injected commands run": "Either tool
 * runs the commands the same way it runs Claude's own shell commands. They share the working
 * directory, timeout, and output handling"; "When an injected command fails"). Every rule of the
 * Bash tool is the rules module's (`tools/semantics`); this file only applies them to a result.
 */

export interface ResultContext {
  readonly shell: SkillShell;
  readonly env: Readonly<Record<string, string>>;
  readonly cwd: string;
  /** The `bashOutputMaxChars` setting. */
  readonly bashOutputMaxChars?: number;
  /** Bare mode turns auto-backgrounding off ("`--bare` ... disables auto-backgrounding"). */
  readonly bare: boolean;
}

export type Step = { readonly output: string } | { readonly failure: string };

const environmentOf = (env: Readonly<Record<string, string>>) => ({
  get: (name: string): string | undefined => env[name],
});

/** Judgment (spec/judgments.md): a value that is not a positive whole number of milliseconds is ignored. */
export const timeoutOf = (env: Readonly<Record<string, string>>): number =>
  effectiveBashTimeout(undefined, environmentOf(env));

/** Whether the command may move to the background at its timeout instead of being killed. */
export const mayMoveToBackground = (command: string, context: ResultContext): boolean =>
  shouldMoveToBackground(command, environmentOf(context.env), { bare: context.bare });

/** Exit 0, and exit 1 of the commands the tool lists, are results: "any non-zero exit code counts as a failure". */
const NORMAL_RESULT: {
  readonly [S in SkillShell]: (command: string, exitCode: number) => boolean;
} = {
  bash: classifyBashExit,
  powershell: classifyPowerShellExit,
};

const isNormalResult = (command: string, shell: SkillShell, exitCode: number | null): boolean =>
  exitCode !== null && NORMAL_RESULT[shell](command, exitCode);

const OUTPUT_FILE = 'skill-command-output.txt';

/** "the path of a file saved to the session directory and truncated past 64 MiB" (tools-reference.md). */
const SAVED_OUTPUT_MAX_BYTES = 64 * 1024 * 1024;

/**
 * A valid result past the inline ceiling "arrives as a file path plus a short preview, not
 * truncated text" (tools-reference.md, "Output limits"). Judgment (spec/judgments.md): the docs give
 * the content, not the wording; without a `ScratchFiles` port, or when it fails, the preview says
 * the rest was not saved.
 */
async function inlineOrFile(
  output: string,
  context: ResultContext,
  scratch: ScratchFiles | undefined,
  signal: AbortSignal,
): Promise<string> {
  const limits = bashOutputLimits(environmentOf(context.env), context.bashOutputMaxChars);
  const window = windowBashOutput({ output, valid: true, limits });
  if (!window.savedToFile) return window.text;
  const saved = prefixWithinBytes(output, SAVED_OUTPUT_MAX_BYTES);
  const path = await scratch?.write(OUTPUT_FILE, saved, signal).catch(() => undefined);
  const extent = saved === output ? 'the full output' : 'the first 64 MiB of the output';
  const where =
    path === undefined
      ? 'the rest could not be saved'
      : `${extent} was saved to ${path}; read or search that file for the rest`;
  return `[The command printed ${output.length} characters, more than fits inline: ${where}. Preview of the first ${window.text.length} characters follows.]\n${window.text}`;
}

/** A failure's output "Inline up to roughly 10,000 characters; past that, a head-and-tail excerpt". */
function failureOutput(output: string, context: ResultContext): string {
  const limits = bashOutputLimits(environmentOf(context.env), context.bashOutputMaxChars);
  return windowBashOutput({ output, valid: false, limits }).text;
}

const failed = (pattern: string, reason: string): string =>
  `Shell command failed for pattern "${pattern}"${reason === '' ? '' : `: ${reason}`}`;

/**
 * The text of a command the Bash tool moved to the background: "The injected text reports the move
 * and names the background task and the file collecting the command's output", and a `cd` inside it
 * "never carries over". Judgment (spec/judgments.md): the sentence around the task and the file.
 */
function movedText(command: string, result: SkillCommandResult, context: ResultContext): string {
  const { taskId = '', outputPath = '' } = result.background ?? {};
  const notice = `${movedByTimeoutNotice(timeoutOf(context.env))}. Background task ${taskId}, output file ${outputPath}.`;
  const cwdNote = backgroundCwdNote(command, context.cwd);
  return cwdNote === undefined ? notice : `${notice} ${cwdNote}`;
}

/** What a run that reached its timeout becomes: a rendered skill when it moved, else the failure. */
function timedOut(
  planned: { readonly pattern: string; readonly command: string },
  result: SkillCommandResult,
  context: ResultContext,
  moveAllowed: boolean,
): Step {
  if (moveAllowed && result.background !== undefined) {
    return { output: movedText(planned.command, result, context) };
  }
  const output = failureOutput(`${result.stdout}${result.stderr}`.trimEnd(), context);
  const minutes = timeoutOf(context.env) / 60_000;
  const limit = Number.isInteger(minutes)
    ? `${minutes} minute${minutes === 1 ? '' : 's'}`
    : `${timeoutOf(context.env) / 1000} seconds`;
  return {
    failure: failed(
      planned.pattern,
      `timed out after ${limit}${output === '' ? '' : `\n${output}`}`,
    ),
  };
}

/** One finished command: a result to inject, or the failure that aborts the invocation. */
export async function renderResult(
  planned: { readonly pattern: string; readonly command: string },
  result: SkillCommandResult,
  context: ResultContext,
  ports: { readonly scratch?: ScratchFiles; readonly signal: AbortSignal },
): Promise<Step> {
  if (result.startError !== undefined)
    return { failure: failed(planned.pattern, result.startError) };
  if (result.timedOut) {
    return timedOut(planned, result, context, mayMoveToBackground(planned.command, context));
  }
  if (isNormalResult(planned.command, context.shell, result.exitCode)) {
    return {
      output: await inlineOrFile(result.stdout.trimEnd(), context, ports.scratch, ports.signal),
    };
  }
  const output = failureOutput(`${result.stdout}${result.stderr}`.trimEnd(), context);
  return {
    failure: failed(
      planned.pattern,
      output === '' ? `exit code ${result.exitCode ?? 'none'}` : output,
    ),
  };
}
