import type { HookEvent } from '../../protocol/official.ts';
import type { ExitedRun } from '../handlers/context.ts';
import {
  EXIT_TABLE,
  exitClassOf,
  type Cell,
  type ExitClass,
  type StdoutClass,
} from './exit-codes.ts';
import { EXIT2_RULES, type Exit2Rule } from './exit2.ts';
import {
  NO_STDERR,
  NON_BLOCKING_STATUS,
  firstLine,
  handlerLabel,
  hookError,
  hookName,
} from './notices.ts';
import { failureVerdict, onFailureBlocks, type Failure } from './on-failure.ts';
import { PLAIN_STDOUT } from './plain-stdout.ts';
import type { Subject } from './subject.ts';
import { readStdout, type StdoutReading } from './stdout-kind.ts';
import { routedBlock, shownWith } from './route.ts';
import type { HandlerVerdict, ParsedOutput, ParseResult } from './types.ts';

/**
 * A run that ended with an exit code (hooks.md, "Exit code output"): the table of stdout against
 * exit code, with the events' own rules on top.
 */

/** Everything the three exit-code readers share. */
interface Read {
  readonly subject: Subject;
  readonly run: Pick<ExitedRun, 'exitCode' | 'stdout' | 'stderr'>;
  readonly reading: StdoutReading;
  readonly output: ParsedOutput | undefined;
  readonly problem: string | undefined;
  readonly cell: Cell;
  readonly rule: Exit2Rule;
}

const base = (subject: Subject) => ({ handler: subject.entry, issues: [] });

/** "WorktreeCreate: a command hook can't return JSON, because Claude Code reads its stdout as the worktree path." */
const PATH_EVENTS: ReadonlySet<HookEvent> = new Set<HookEvent>(['WorktreeCreate']);

const isCommand = (subject: Subject): boolean => 'command' in subject.entry.handler;

const readsPath = (subject: Subject): boolean =>
  PATH_EVENTS.has(subject.event) && isCommand(subject);

const missingFile = /No such file or directory/i;

const lineFor = (subject: Subject, text: string): string =>
  hookError(hookName(subject.event, subject.toolName), handlerLabel(subject.entry.handler), text);

/** A failure of the output: it cannot be parsed or fails validation. */
const invalidOutput = (read: Read): Failure => {
  const text = read.problem ?? 'the output is not valid';
  return { cause: 'invalid-output', text, detail: text };
};

const otherExit = (read: Read): Failure => ({
  cause: 'other-exit',
  text: `${NON_BLOCKING_STATUS} ${firstLine(read.run.stderr) || NO_STDERR}`,
  detail: read.run.stderr,
});

const HOOK_SPECIFIC_OUTPUT = 'hookSpecificOutput';

/**
 * "Claude Code applies your `hookSpecificOutput` when your hook exits 0, and ignores it on any
 * other exit code": only that field is dropped, `systemMessage` and `continue` still count.
 */
function withoutSpecific(output: ParsedOutput): ParsedOutput | undefined {
  const rest = Object.entries(output).filter(([key]) => key !== HOOK_SPECIFIC_OUTPUT);
  return rest.length === 0 ? undefined : Object.fromEntries(rest);
}

/** The output counts only when the table says its fields do, and the event reads it on this code. */
const appliedOutput = (read: Read, exitClass: ExitClass): ParsedOutput | undefined =>
  read.output === undefined || read.cell.fields === 'none'
    ? undefined
    : read.rule.outputOnlyOnExit0 === true && exitClass !== 'zero'
      ? withoutSpecific(read.output)
      : read.output;

const success = (read: Read, exitClass: ExitClass): HandlerVerdict => {
  const { subject, reading, output } = read;
  const as = PLAIN_STDOUT[subject.event];
  const plain =
    exitClass === 'zero' && output === undefined && reading.text !== '' && as !== undefined
      ? { plainText: { text: reading.text, as } }
      : {};
  const applied = appliedOutput(read, exitClass);
  return {
    ...base(subject),
    status: 'success',
    succeeded: true,
    ...(applied === undefined ? {} : { output: applied }),
    ...plain,
    ...(readsPath(subject) ? { stdout: read.run.stdout } : {}),
    ...(subject.effectsIgnored ? { effectsIgnored: true } : {}),
  };
};

const exit0 = (read: Read): HandlerVerdict =>
  read.cell.result === 'non-blocking-error'
    ? failureVerdict(read.subject, invalidOutput(read))
    : success(read, 'zero');

/** Exit 2 on an event that cannot block: the stderr goes where the table's row says. */
function unblockable(read: Read): HandlerVerdict {
  const { subject, rule, run } = read;
  const message = lineFor(subject, run.stderr.trim());
  const handlerId = subject.entry.id;
  const output = appliedOutput(read, 'two');
  const common = {
    ...base(subject),
    status: 'non-blocking-error' as const,
    succeeded: false,
    ...(output === undefined ? {} : { output }),
  };
  if (rule.stderr === 'claude') {
    return { ...common, feedback: { handlerId, to: 'claude', text: message } };
  }
  if (rule.stderr === 'user') return { ...common, notice: { handlerId, message } };
  return common;
}

function blocked(read: Read): HandlerVerdict {
  const { subject, run } = read;
  const reason = run.stderr.trim();
  const block = routedBlock(
    subject.event,
    'exit2',
    { reason, message: lineFor(subject, reason) },
    read.rule.blocksUnlessDirectoryGone === true ? 'worktree-directory-remains' : undefined,
  );
  const output = appliedOutput(read, 'two');
  return {
    ...base(subject),
    status: 'blocked',
    succeeded: false,
    block,
    ...shownWith(subject.entry.id, block),
    ...(output === undefined ? {} : { output }),
  };
}

/**
 * "Stop, SubagentStop, TaskCompleted, and a plugin's UserPromptSubmit hook: when your hook exits 2
 * with nothing on stdout and its stderr says a file is missing, such as `No such file or directory`,
 * Claude Code treats the run as a non-blocking error."
 */
const isMissingFile = (read: Read): boolean =>
  read.reading.text === '' &&
  missingFile.test(read.run.stderr) &&
  read.rule.missingFileIsError?.(read.subject.entry.source) === true;

function exit2(read: Read): HandlerVerdict {
  if (isMissingFile(read)) return failureVerdict(read.subject, otherExit(read));
  if (read.rule.cannotBlockWhen?.(read.subject.facts) === true) return unblockable(read);
  return read.rule.canBlock ? blocked(read) : unblockable(read);
}

/** A hook that fails when it exits with another code than 0 or 2 (a failure for `onFailure`, too). */
function exitOther(read: Read): HandlerVerdict {
  const { subject, cell, rule } = read;
  if (rule.anyNonZeroBlocks === true) return failureVerdict(subject, otherExit(read));
  if (cell.result === 'non-blocking-error') {
    return failureVerdict(
      subject,
      cell.message === 'validation' ? invalidOutput(read) : otherExit(read),
    );
  }
  // "Success. Claude Code ignores the exit code, and the fields alone decide. For hooks whose
  // failure blocks the action, the run counts as a failure instead."
  return onFailureBlocks(subject)
    ? failureVerdict(subject, otherExit(read))
    : success(read, 'other');
}

const EXIT_READERS: { readonly [X in ExitClass]: (read: Read) => HandlerVerdict } = {
  zero: exit0,
  two: exit2,
  other: exitOther,
};

/** What the stdout is, against the output schema: the row of the table it falls in. */
function classify(
  reading: StdoutReading,
  checked: ParseResult | undefined,
): { output: ParsedOutput | undefined; problem: string | undefined; stdoutClass: StdoutClass } {
  const output = checked?.output;
  const unchecked = reading.json !== undefined && output === undefined;
  const problem =
    reading.parseFailure ??
    checked?.failure ??
    (unchecked ? 'the output failed validation' : undefined);
  const stdoutClass: StdoutClass =
    problem !== undefined ? 'json-invalid' : output !== undefined ? 'json-valid' : 'plain';
  return { output, problem, stdoutClass };
}

/** The reading of the run's stdout against the output schema. */
function readOutput(subject: Subject, stdout: string) {
  const reading: StdoutReading = readsPath(subject) ? { text: stdout.trim() } : readStdout(stdout);
  const checked =
    reading.json === undefined ? undefined : subject.parse(subject.event, reading.json);
  return { reading, ...classify(reading, checked) };
}

export function interpretExited(
  subject: Subject,
  run: Pick<ExitedRun, 'exitCode' | 'stdout' | 'stderr'>,
): HandlerVerdict {
  const { stdoutClass, ...rest } = readOutput(subject, run.stdout);
  const exitClass = exitClassOf(run.exitCode);
  const cell = EXIT_TABLE[exitClass][stdoutClass];
  return EXIT_READERS[exitClass]({ subject, run, cell, rule: EXIT2_RULES[subject.event], ...rest });
}
