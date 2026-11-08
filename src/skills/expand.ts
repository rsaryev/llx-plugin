import type { PluginIssue } from '../format/issues.ts';
import type { Command, Skill } from '../format/skill-types.ts';
import type { EffortLevel } from '../protocol/official.ts';
import { grantApplies, hooksRegister } from './expand-policy.ts';
import { render, modeOf } from './expand-shell.ts';
import type { ExpandPorts, ExpandRequest, Expansion } from './expand-types.ts';
import {
  readExecutionEnvironment,
  resolveExecution,
  resolveTurnOverrides,
  type TurnOverrides,
} from './execution.ts';
import { findInjections, type Injection } from './shell-scan.ts';
import { substituteArgumentPieces } from './substitute.ts';
import {
  buildVariables,
  substituteAllowedTools,
  substituteVariables,
  type SkillVariables,
} from './variables.ts';

export type { ExpandPolicy, SkillPluginSource } from './expand-policy.ts';
export type {
  ExpandPorts,
  ExpandRequest,
  ExpandSession,
  Expansion,
  SessionLimits,
} from './expand-types.ts';
export type { ShellCall, ShellPermission } from './shell-run.ts';

/**
 * Expanding a skill or a command into what the model receives and what the host must apply
 * (skills.md, "Inject dynamic context", "Available string substitutions", "Pass arguments to
 * skills", "Pre-approve tools for a skill", "Run skills in a subagent"). The order is the
 * documented one: the placeholders are found in the original text, arguments are substituted, then
 * `${CLAUDE_*}`, then the commands run, and their output is never scanned again. Effects go
 * through the ports; a plugin error is an issue, never a throw.
 */

type Source = Skill | Command;

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
  const granted = grantApplies(skill, request.policy, pluginSource);
  const allowed = granted ? await substituteAllowedTools(skill, vars) : { rules: [], issues: [] };
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
    ignoredGrants: granted ? [] : skill.allowedTools,
    disallowed: skill.disallowedTools,
    execution,
    turn,
    ...(skill.hooks !== undefined && hooksRegister(skill, request.policy, pluginSource)
      ? { hooks: skill.hooks }
      : {}),
    issues: [...body.issues, ...allowed.issues],
  };
}
