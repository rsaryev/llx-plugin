import { error, type PluginIssue } from '../format/issues.ts';
import type { Command, Skill, SkillShell } from '../format/skill-types.ts';
import { ORIGIN_TRAITS } from '../format/skill-types.ts';
import type { Environment, Locations, CommandRunner } from '../ports/index.ts';
import type { HooksSettings } from '../protocol/hook-config.ts';
import type { EffortLevel, PermissionMode } from '../protocol/official.ts';
import {
  grantApplies,
  hooksRegister,
  type ExpandPolicy,
  type SkillPluginSource,
} from './expand-policy.ts';
import {
  readExecutionEnvironment,
  resolveExecution,
  resolveShell,
  resolveTurnOverrides,
  type Execution,
  type ExecutionContext,
  type ShellAvailability,
  type TurnOverrides,
  type TurnSession,
} from './execution.ts';
import { findInjections, type Injection } from './shell-scan.ts';
import { runInjections, type ShellPermission } from './shell-run.ts';
import { substituteArgumentPieces } from './substitute.ts';
import {
  buildVariables,
  substituteAllowedTools,
  substituteVariables,
  type SkillSession,
  type SkillVariables,
} from './variables.ts';

export type { ExpandPolicy, SkillPluginSource } from './expand-policy.ts';
export type { ShellCall, ShellPermission } from './shell-run.ts';

/**
 * Expanding a skill or a command into what the model receives and what the host must apply
 * (skills.md, "Inject dynamic context", "Available string substitutions", "Pass arguments to
 * skills", "Pre-approve tools for a skill", "Run skills in a subagent"). The order is the
 * documented one: the placeholders are found in the original text, arguments are substituted, then
 * `${CLAUDE_*}`, then the commands run, and their output is never scanned again. Effects go
 * through the ports; a plugin error is an issue, never a throw.
 */

/** The values a skill's variables need beyond the request itself (see `SkillSession`). */
export type ExpandSession = Pick<
  SkillSession,
  'pluginId' | 'userConfig' | 'windows' | 'isolatedSession' | 'skillRoot'
> & {
  /** Where the skill's plugin was loaded from; default `installed`. Only a plugin skill reads it. */
  readonly pluginSource?: SkillPluginSource;
};

/** What the host knows about the session beyond the environment the kit reads itself. */
export type SessionLimits = Omit<TurnSession, 'effortEnvironment'>;

export interface ExpandRequest {
  /** The text after the command name, as typed. */
  readonly arguments: string;
  readonly sessionId: string;
  /** The session's effort level: `${CLAUDE_EFFORT}` when the skill sets none and none is forced. */
  readonly effort?: EffortLevel;
  /** Auto mode changes what a command that needs approval does. */
  readonly permissionMode?: PermissionMode;
  /** The `disableSkillShellExecution` setting. */
  readonly disableShellExecution: boolean;
  readonly shells: ShellAvailability;
  /** Who fired the skill and in what kind of session (`backgroundTasksDisabled` is read from the environment). */
  readonly context: Omit<ExecutionContext, 'backgroundTasksDisabled'>;
  /** The model allowlist, the effort cap and the model's supported levels. */
  readonly limits?: SessionLimits;
  readonly session?: ExpandSession;
  readonly policy?: ExpandPolicy;
  /** The session shell's working directory; default `Locations.projectDir()`. */
  readonly cwd?: string;
  readonly signal: AbortSignal;
}

export interface ExpandPorts {
  readonly runner: CommandRunner;
  readonly locations: Locations;
  readonly environment: Environment;
  /** The host's answer for each command: its rules, the skill's grants and the mode. */
  readonly permissions: ShellPermission;
}

export type Expansion =
  | {
      readonly ok: true;
      /** What the model receives. */
      readonly text: string;
      /** `allowed-tools` with `${CLAUDE_*}` substituted in its Bash rules: pre-approved for this turn. */
      readonly grants: readonly string[];
      /** `disallowed-tools`: removed from the pool for this turn. */
      readonly disallowed: readonly string[];
      readonly execution: Execution;
      readonly turn: TurnOverrides;
      /** Registered when the skill is invoked and kept for the rest of the session. */
      readonly hooks?: HooksSettings;
      /** Warnings that did not stop the expansion. */
      readonly issues: readonly PluginIssue[];
    }
  | { readonly ok: false; readonly issues: readonly PluginIssue[] };

type Source = Skill | Command;

/** How a placeholder is treated, decided by the setting and the origin. */
type Mode = 'run' | 'disabled' | 'literal';

const DISABLED_TEXT = '[shell command execution disabled by policy]';

/** What a placeholder becomes when its command is not run. */
const NOT_RUN: {
  readonly [M in Exclude<Mode, 'run'>]: (found: Injection, command: string) => string;
} = {
  disabled: () => DISABLED_TEXT,
  // "A `!` command line reaches Claude as literal text": as written, its arguments substituted.
  literal: (found, command) => `${found.open}${command}${found.close}`,
};

/**
 * `disableSkillShellExecution` replaces every command, in a synced skill too ("or as that
 * placeholder when `disableSkillShellExecution` is on"). Otherwise a synced skill's commands are not
 * run on the owner's machine, but are in an isolated session (cloud, Cowork).
 */
function modeOf(skill: Source, request: ExpandRequest): Mode {
  if (request.disableShellExecution) return 'disabled';
  const runs =
    ORIGIN_TRAITS[skill.origin.kind].runsShell || request.session?.isolatedSession === true;
  return runs ? 'run' : 'literal';
}

/** The text cut at its placeholders: text at even indices, the command at the odd ones. */
function cut(body: string, injections: readonly Injection[]): readonly string[] {
  const pieces: string[] = [];
  let at = 0;
  for (const found of injections) {
    pieces.push(body.slice(at, found.start), found.command);
    at = found.end;
  }
  pieces.push(body.slice(at));
  return pieces;
}

interface Substituted {
  readonly pieces: readonly string[];
  readonly issues: readonly PluginIssue[];
}

/** Arguments, then `${CLAUDE_*}`, over every piece (commands included: judgment in spec/judgments.md). */
async function substitutePieces(
  pieces: readonly string[],
  skill: Source,
  request: ExpandRequest,
  vars: SkillVariables,
): Promise<Substituted> {
  const withArguments = substituteArgumentPieces(pieces, {
    rawArguments: request.arguments,
    names: skill.arguments,
  });
  const done = await Promise.all(withArguments.map((piece) => substituteVariables(piece, vars)));
  return { pieces: done.map((piece) => piece.text), issues: done.flatMap((piece) => piece.issues) };
}

/** The text with each placeholder replaced by its rendering. */
function assemble(pieces: readonly string[], replacements: readonly string[]): string {
  let text = pieces[0] ?? '';
  for (const [index, replacement] of replacements.entries()) {
    text += replacement + (pieces[2 * index + 2] ?? '');
  }
  return text;
}

type Rendered =
  | { readonly ok: true; readonly replacements: readonly string[] }
  | { readonly ok: false; readonly issue: PluginIssue };

interface Run {
  readonly skill: Source;
  readonly request: ExpandRequest;
  readonly ports: ExpandPorts;
  readonly injections: readonly Injection[];
  readonly commands: readonly string[];
  readonly grants: readonly string[];
}

/** Runs the commands through the tool `resolveShell` chose. */
async function runAll(run: Run, tool: SkillShell): Promise<Rendered> {
  const { skill, request, ports } = run;
  const planned = run.injections.map((found, index) => ({
    pattern: `${found.open}${found.command}${found.close}`,
    command: run.commands[index] ?? found.command,
  }));
  const result = await runInjections(
    planned,
    {
      name: `/${skill.command}`,
      shell: tool,
      cwd: request.cwd ?? ports.locations.projectDir(),
      env: ports.environment.snapshot(),
      grants: run.grants,
      mode: request.permissionMode,
      forkedWithAgent: skill.context === 'fork' && skill.agent !== undefined,
      signal: request.signal,
    },
    ports,
  );
  return result.ok ? { ok: true, replacements: result.outputs } : result;
}

/**
 * The replacement of each placeholder. Judgment (spec/judgments.md): a skill with no placeholder to
 * run needs no shell, so it never fails for want of one.
 */
async function render(run: Run, mode: Mode): Promise<Rendered> {
  if (mode !== 'run') {
    const make = NOT_RUN[mode];
    return {
      ok: true,
      replacements: run.injections.map((found, i) => make(found, run.commands[i] ?? '')),
    };
  }
  if (run.injections.length === 0) return { ok: true, replacements: [] };
  const shell = resolveShell(run.skill, run.request.shells);
  if (!shell.ok) return { ok: false, issue: error(`/${run.skill.command}`, shell.message) };
  return runAll(run, shell.tool);
}

/** `${CLAUDE_EFFORT}` is the level the skill runs at: the one chosen for it, else the session's. */
const effortOf = (turn: TurnOverrides, request: ExpandRequest): EffortLevel | undefined =>
  turn.effort?.level ?? request.effort;

function variablesFor(
  skill: Source,
  request: ExpandRequest,
  ports: ExpandPorts,
  turn: TurnOverrides,
): SkillVariables {
  const effort = effortOf(turn, request);
  return buildVariables(
    skill,
    {
      ...request.session,
      sessionId: request.sessionId,
      ...(effort === undefined ? {} : { effort }),
      signal: request.signal,
    },
    ports,
  );
}

/** Expands `skill` for one invocation. */
export async function expandSkill(
  skill: Source,
  request: ExpandRequest,
  ports: ExpandPorts,
): Promise<Expansion> {
  const environment = readExecutionEnvironment(ports.environment);
  const turn = resolveTurnOverrides(skill, {
    ...request.limits,
    effortEnvironment: environment.effort,
  });
  const execution = resolveExecution(skill, {
    ...request.context,
    backgroundTasksDisabled: environment.backgroundTasksDisabled,
  });
  const vars = variablesFor(skill, request, ports, turn);
  const injections = findInjections(skill.body);
  const body = await substitutePieces(cut(skill.body, injections), skill, request, vars);
  const pluginSource = request.session?.pluginSource;
  const allowed = grantApplies(skill, request.policy, pluginSource)
    ? await substituteAllowedTools(skill, vars)
    : { rules: [], issues: [] };
  const commands = injections.map((_, index) => body.pieces[2 * index + 1] ?? '');
  const rendered = await render(
    { skill, request, ports, injections, commands, grants: allowed.rules },
    modeOf(skill, request),
  );
  if (!rendered.ok) return { ok: false, issues: [rendered.issue] };
  return {
    ok: true,
    text: assemble(body.pieces, rendered.replacements),
    grants: allowed.rules,
    disallowed: skill.disallowedTools,
    execution,
    turn,
    ...(skill.hooks !== undefined && hooksRegister(skill, request.policy, pluginSource)
      ? { hooks: skill.hooks }
      : {}),
    issues: [...body.issues, ...allowed.issues],
  };
}
