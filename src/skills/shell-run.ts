import type { PluginIssue } from '../format/issues.ts';
import { error } from '../format/issues.ts';
import type { SkillShell } from '../format/skill-types.ts';
import type { ScratchFiles } from '../ports/index.ts';
import type { PermissionBehavior, PermissionMode } from '../protocol/official.ts';
import type { DocumentedTool } from '../protocol/tool-names.ts';
import { refusalOf } from './shell-refusal.ts';
import { mayMoveToBackground, renderResult, timeoutOf, type Step } from './shell-result.ts';
import type { SkillCommandRunner } from './shell-ports.ts';

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
  /**
   * The command after substitution with its paths written in, as data: the text a permission rule
   * is written against (skills.md: an `allowed-tools` rule "matches the exact command"). Under the
   * default `shellPaths` the shell runs the same command with each path a reference to its
   * environment, so a quote or `$(...)` in a folder name is never parsed (spec/judgments.md).
   */
  readonly command: string;
  /**
   * The skill's `allowed-tools` with `${CLAUDE_*}` substituted. "Deny and ask rules still override
   * `allowed-tools`": the host builds its answer from its rules, then these grants, then the mode.
   */
  readonly grants: readonly string[];
}

/** The host's answer for one command: what its permission rules and the skill's grants decide. */
export type ShellPermission = (call: ShellCall) => PermissionBehavior | Promise<PermissionBehavior>;

/** One command to run: what is checked, what the shell gets, and its placeholder (for messages). */
export interface PlannedCommand {
  readonly pattern: string;
  /** The command with its paths written in: what the refusal, the rules and the messages read. */
  readonly command: string;
  /** What the shell runs: `command` with its paths as the host's `shellPaths` writes them. */
  readonly shellCommand: string;
  /** The values of the references `shellCommand` holds, added to the command's environment. */
  readonly environment: Readonly<Record<string, string>>;
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
  /** The `bashOutputMaxChars` setting: how much of a result arrives inline. */
  readonly bashOutputMaxChars?: number;
  /** Bare mode: a command that reaches its timeout stops instead of moving to the background. */
  readonly bare?: boolean;
}

export interface InjectionPorts {
  readonly runner: SkillCommandRunner;
  readonly permissions: ShellPermission;
  /** Where a result past the inline ceiling is saved ("a file path plus a short preview"). */
  readonly scratch?: ScratchFiles;
}

export type InjectionResults =
  | { readonly ok: true; readonly outputs: readonly string[] }
  | { readonly ok: false; readonly issue: PluginIssue };

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

/** The context the result rules read. */
const resultContext = (context: InjectionContext) => ({
  shell: context.shell,
  env: context.env,
  cwd: context.cwd,
  bare: context.bare === true,
  ...(context.bashOutputMaxChars === undefined
    ? {}
    : { bashOutputMaxChars: context.bashOutputMaxChars }),
});

async function execute(
  planned: PlannedCommand,
  context: InjectionContext,
  ports: InjectionPorts,
): Promise<Step> {
  const { shell } = context;
  const rules = resultContext(context);
  const result = await ports.runner.run({
    spec: { form: 'shell', command: planned.shellCommand, shell },
    cwd: context.cwd,
    env: { ...context.env, ...planned.environment },
    timeoutMs: timeoutOf(context.env),
    // "With the default `bash` shell, Claude Code merges stderr into stdout."
    mergeStderr: shell === 'bash',
    moveToBackgroundOnTimeout: mayMoveToBackground(planned.command, rules),
    signal: context.signal,
  });
  return renderResult(planned, result, rules, { signal: context.signal, ...scratchOf(ports) });
}

const scratchOf = (ports: InjectionPorts) =>
  ports.scratch === undefined ? {} : { scratch: ports.scratch };

/**
 * One command, with a file's CRLF line endings read as plain newlines: the refusal check and the
 * permission rules see the same text, and the shell that text with its paths as references.
 */
async function step(
  given: PlannedCommand,
  context: InjectionContext,
  ports: InjectionPorts,
): Promise<Step> {
  const planned = {
    ...given,
    command: given.command.replaceAll('\r\n', '\n'),
    shellCommand: given.shellCommand.replaceAll('\r\n', '\n'),
  };
  const refused = refusalOf(planned.command, context.name, context.shell);
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
    : execute(planned, context, ports);
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
