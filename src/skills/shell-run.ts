import type { PluginIssue } from '../format/issues.ts';
import { error } from '../format/issues.ts';
import type { SkillShell } from '../format/skill-types.ts';
import type { CommandResult, CommandRunner } from '../ports/index.ts';
import type { PermissionBehavior, PermissionMode } from '../protocol/official.ts';
import type { DocumentedTool } from '../protocol/tool-names.ts';
import { isNormalResult } from './shell-exit.ts';

/**
 * Running the commands a skill injects (skills.md, "Inject dynamic context", "How injected commands
 * run", "When an injected command fails", "Permission checks on injected commands"; errors.md, "No
 * shell command in a skill or command was run"). Every effect is the `CommandRunner` port; the
 * permission answer is the host's (`ShellPermission`), since the deny, ask and allow engine and the
 * grants of `allowed-tools` meet the session's rules there.
 */

/** The tool a command runs through, as the permission rules name it. */
type ShellTool = Extract<DocumentedTool, 'Bash' | 'PowerShell'>;

const TOOL_NAMES: { readonly [S in SkillShell]: ShellTool } = {
  bash: 'Bash',
  powershell: 'PowerShell',
};

export interface ShellCall {
  readonly tool: ShellTool;
  /** The command after substitution, as it would run. */
  readonly command: string;
  /**
   * The skill's `allowed-tools` with `${CLAUDE_*}` substituted. "Deny and ask rules still override
   * `allowed-tools`": the host builds its answer from its rules, then these grants, then the mode.
   */
  readonly grants: readonly string[];
}

/** The host's answer for one command: what its permission rules and the skill's grants decide. */
export type ShellPermission = (call: ShellCall) => PermissionBehavior | Promise<PermissionBehavior>;

/** One command to run: what the shell gets, and the placeholder it came from (for messages). */
export interface PlannedCommand {
  readonly pattern: string;
  readonly command: string;
}

export interface InjectionContext {
  /** The command name with its slash, as `No shell command in <name> was run` quotes it. */
  readonly name: string;
  readonly shell: SkillShell;
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly grants: readonly string[];
  readonly mode: PermissionMode | undefined;
  /** A forked skill that sets `agent`: the permission check always aborts there. */
  readonly forkedWithAgent: boolean;
  readonly signal: AbortSignal;
}

export interface InjectionPorts {
  readonly runner: CommandRunner;
  readonly permissions: ShellPermission;
}

export type InjectionResults =
  | { readonly ok: true; readonly outputs: readonly string[] }
  | { readonly ok: false; readonly issue: PluginIssue };

/** "Each command runs under the Bash tool's default 2-minute timeout." */
const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * The Bash tool's default timeout is `BASH_DEFAULT_TIMEOUT_MS` (tools-reference.md, "Timeout and
 * output limits"; the PowerShell tool reads the same variable). Judgment (spec/judgments.md): a
 * value that is not a positive whole number of milliseconds is ignored, and `BASH_MAX_TIMEOUT_MS`
 * is not read since it only caps a timeout the model asks for.
 */
function timeoutOf(env: Readonly<Record<string, string>>): number {
  const value = env['BASH_DEFAULT_TIMEOUT_MS'];
  const parsed = value !== undefined && /^\d+$/.test(value) ? Number(value) : 0;
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

const MINUTE_MS = 60_000;

/** `2 minutes`, or seconds when the timeout is not a whole number of minutes. */
function duration(ms: number): string {
  if (ms % MINUTE_MS !== 0) return `${ms / 1000} seconds`;
  const minutes = ms / MINUTE_MS;
  return minutes === 1 ? '1 minute' : `${minutes} minutes`;
}

const isControl = (code: number): boolean =>
  code <= 0x08 || (code >= 0x0b && code <= 0x1f) || (code >= 0x7f && code <= 0x9f);

/** "PowerShell tool: also U+FEFF or U+180E". */
const isPowerShellOnly = (code: number): boolean => code === 0xfeff || code === 0x180e;

/**
 * The characters each tool refuses (errors.md): "a raw control character other than a tab or
 * newline" for either tool, and for PowerShell also U+FEFF and U+180E.
 */
const REFUSED: { readonly [S in SkillShell]: (code: number) => boolean } = {
  bash: isControl,
  powershell: (code) => isControl(code) || isPowerShellOnly(code),
};

const TOOL_LABEL: { readonly [S in SkillShell]: string } = {
  bash: 'Bash',
  powershell: 'PowerShell',
};

/** Each refused character shown as the replacement mark. */
const shown = (command: string, shell: SkillShell): string =>
  Array.from(command, (char) => (REFUSED[shell](char.codePointAt(0) ?? 0) ? '\uFFFD' : char)).join(
    '',
  );

/**
 * The message of errors.md. Judgment (spec/judgments.md): a file with CRLF line endings is not
 * refused for its carriage returns, and the check comes before the permission check.
 */
function refusal(planned: PlannedCommand, context: InjectionContext): string | undefined {
  const marked = shown(planned.command, context.shell);
  if (marked === planned.command) return undefined;
  return (
    `No shell command in ${context.name} was run, because the ${TOOL_LABEL[context.shell]} tool does not accept one of them: ` +
    'command contains control characters that would be hidden in the approval dialog. ' +
    'Unprintable characters are shown as \uFFFD below: remove them from the skill or command file, ' +
    `or from the arguments or options substituted into it.\n${marked}`
  );
}

type Verdict = 'run' | 'abort' | 'defer';

/** Only auto mode lets a command that needs approval through with an instruction. */
const DEFERS_ASK: { readonly [M in PermissionMode]: boolean } = {
  default: false,
  acceptEdits: false,
  bypassPermissions: false,
  plan: false,
  dontAsk: false,
  auto: true,
};

const defersAsk = (mode: PermissionMode | undefined): boolean =>
  mode !== undefined && DEFERS_ASK[mode];

/**
 * What each answer means (skills.md, "Permission checks on injected commands"). An answer that is
 * not allow aborts, except in auto mode, where an ask "doesn't abort the invocation": the skill
 * loads with an instruction to run the command first. That does not hold "in a forked skill that
 * sets `agent`".
 */
const VERDICTS: {
  readonly [B in PermissionBehavior]: (context: InjectionContext) => Verdict;
} = {
  allow: () => 'run',
  deny: () => 'abort',
  ask: (context) => (defersAsk(context.mode) && !context.forkedWithAgent ? 'defer' : 'abort'),
};

/**
 * Judgment (spec/judgments.md): the instruction that takes the place of a command auto mode did not
 * run; the docs give its intent ("an instruction telling Claude to run the command first").
 */
const instructionFor = (command: string): string =>
  `[This command needs approval and was not run. Run it first, then use its output here: ${command}]`;

const failed = (planned: PlannedCommand, reason: string): string =>
  `Shell command failed for pattern "${planned.pattern}"${reason === '' ? '' : `: ${reason}`}`;

/** Why a run counts as a failure, or `undefined` for a result to inject. */
function failureReason(
  planned: PlannedCommand,
  result: CommandResult,
  context: InjectionContext,
): string | undefined {
  const output = `${result.stdout}${result.stderr}`.trimEnd();
  if (result.startError !== undefined) return result.startError;
  if (result.timedOut)
    return `timed out after ${duration(timeoutOf(context.env))}${output === '' ? '' : `\n${output}`}`;
  if (isNormalResult(planned.command, context.shell, result.exitCode)) return undefined;
  return output === '' ? `exit code ${result.exitCode ?? 'none'}` : output;
}

async function execute(
  planned: PlannedCommand,
  context: InjectionContext,
  runner: CommandRunner,
): Promise<{ readonly output: string } | { readonly failure: string }> {
  const { shell } = context;
  const result = await runner.run({
    spec: { form: 'shell', command: planned.command, shell },
    cwd: context.cwd,
    env: context.env,
    timeoutMs: timeoutOf(context.env),
    // "With the default `bash` shell, Claude Code merges stderr into stdout."
    mergeStderr: shell === 'bash',
    signal: context.signal,
  });
  const reason = failureReason(planned, result, context);
  return reason === undefined
    ? { output: result.stdout.trimEnd() }
    : { failure: failed(planned, reason) };
}

type Step = { readonly output: string } | { readonly failure: string };

/**
 * One command, with a file's CRLF line endings read as plain newlines: the refusal check, the
 * permission rules and the shell all see the same text.
 */
async function step(
  given: PlannedCommand,
  context: InjectionContext,
  ports: InjectionPorts,
): Promise<Step> {
  const planned = { ...given, command: given.command.replaceAll('\r\n', '\n') };
  const refused = refusal(planned, context);
  if (refused !== undefined) return { failure: refused };
  const answer = await ports.permissions({
    tool: TOOL_NAMES[context.shell],
    command: planned.command,
    grants: context.grants,
  });
  const verdict = VERDICTS[answer](context);
  if (verdict === 'abort') {
    return { failure: `Shell command permission check failed for pattern "${planned.pattern}"` };
  }
  return verdict === 'defer'
    ? { output: instructionFor(planned.command) }
    : execute(planned, context, ports.runner);
}

/**
 * Runs the commands one after another, in order (they share the working directory). The first
 * failure aborts the whole invocation: "Claude never sees the skill content for that invocation".
 */
export async function runInjections(
  commands: readonly PlannedCommand[],
  context: InjectionContext,
  ports: InjectionPorts,
): Promise<InjectionResults> {
  const outputs: string[] = [];
  for (const planned of commands) {
    const done = await step(planned, context, ports);
    if ('failure' in done) return { ok: false, issue: error(context.name, done.failure) };
    outputs.push(done.output);
  }
  return { ok: true, outputs };
}
