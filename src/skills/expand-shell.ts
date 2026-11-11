import { error, type PluginIssue } from '../format/issues.ts';
import type { Command, Skill, SkillShell } from '../format/skill-types.ts';
import { ORIGIN_TRAITS, type SkillOriginKind } from '../format/skill-types.ts';
import { resolveShell } from './execution.ts';
import type { ExpandPorts, ExpandRequest } from './expand-types.ts';
import type { Injection } from './shell-scan.ts';
import { runInjections, type PlannedCommand } from './shell-run.ts';
import { substituteShellCommand } from './shell-variables.ts';
import { bindShellArguments, bindsArguments } from './shell-arguments.ts';
import { substituteVariables, type SkillVariables } from './variables.ts';

/**
 * What each `` !`command` `` placeholder of a skill becomes (skills.md, "Inject dynamic context"):
 * its command's output, the `disableSkillShellExecution` placeholder, or its own text.
 */

export type Source = Skill | Command;

/** How a placeholder is treated, decided by the setting and the origin. */
export type Mode = 'run' | 'disabled' | 'literal';

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
 * Whether `disableSkillShellExecution` replaces an origin's commands: it covers "skills and custom
 * commands from user, project, plugin, or additional-directory sources" and a synced skill ("or as
 * that placeholder when `disableSkillShellExecution` is on"); "Bundled and managed skills are not
 * affected". A bundled skill is the host's.
 */
const DISABLE_APPLIES: { readonly [K in SkillOriginKind]: boolean } = {
  plugin: true,
  managed: false,
  user: true,
  project: true,
  synced: true,
  bundled: false,
};

/**
 * `disableSkillShellExecution` replaces the commands of the origins it covers. Otherwise a synced
 * skill's commands are not run on the owner's machine, but are in an isolated session (cloud, Cowork).
 */
export function modeOf(skill: Source, request: ExpandRequest): Mode {
  if (request.disableShellExecution && DISABLE_APPLIES[skill.origin.kind]) return 'disabled';
  const runs =
    ORIGIN_TRAITS[skill.origin.kind].runsShell || request.session?.isolatedSession === true;
  return runs ? 'run' : 'literal';
}

export type Rendered =
  | { readonly ok: true; readonly replacements: readonly string[] }
  | { readonly ok: false; readonly issue: PluginIssue };

export interface Run {
  readonly skill: Source;
  readonly request: ExpandRequest;
  readonly ports: ExpandPorts;
  readonly injections: readonly Injection[];
  /** Each command with its variables substituted, the paths written in: what is checked. */
  readonly commands: readonly string[];
  /** Each command with its arguments substituted only: what the shell's text is made from. */
  readonly templates: readonly string[];
  readonly vars: SkillVariables;
  readonly grants: readonly string[];
}

/**
 * One command's checked text and the shell's template under the host's `shellArguments`: pasted,
 * the substitution's; bound, the authored command with its arguments bound, variables after.
 */
async function argumentsOf(run: Run, tool: SkillShell, found: Injection, index: number) {
  const pasted = run.commands[index] ?? found.command;
  const template = run.templates[index] ?? found.command;
  if (!bindsArguments(run.request.session?.shellArguments, tool))
    return { checked: pasted, template, environment: {} };
  const input = { rawArguments: run.request.arguments, names: run.skill.arguments };
  const bound = bindShellArguments(found.command, input);
  const checked = await substituteVariables(bound.checked, run.vars);
  return { checked: checked.text, template: bound.shell, environment: bound.environment };
}

/** Each placeholder's command: the checked text, and the shell's under `shellPaths` and `shellArguments`. */
const planOf = (run: Run, tool: SkillShell): Promise<PlannedCommand[]> =>
  Promise.all(
    run.injections.map(async (found, index) => {
      const texts = await argumentsOf(run, tool, found, index);
      const shell = await substituteShellCommand(texts.template, run.vars, tool);
      return {
        pattern: `${found.open}${found.command}${found.close}`,
        command: texts.checked,
        shellCommand: shell.text,
        environment: { ...shell.environment, ...texts.environment },
      };
    }),
  );

/** Runs the commands through the tool `resolveShell` chose. */
async function runAll(run: Run, tool: SkillShell): Promise<Rendered> {
  const { skill, request, ports } = run;
  const result = await runInjections(
    await planOf(run, tool),
    {
      name: `/${skill.command}`,
      shell: tool,
      cwd: request.cwd ?? ports.locations.projectDir(),
      env: request.commandEnvironment?.(tool) ?? ports.environment.snapshot(),
      grants: run.grants,
      mode: request.permissionMode,
      forkedWithAgent: skill.context === 'fork' && skill.agent !== undefined,
      signal: request.signal,
      ...(request.bashOutputMaxChars === undefined
        ? {}
        : { bashOutputMaxChars: request.bashOutputMaxChars }),
      ...(request.bare === undefined ? {} : { bare: request.bare }),
    },
    ports,
  );
  return result.ok ? { ok: true, replacements: result.outputs } : result;
}

/**
 * The replacement of each placeholder. Judgment (spec/judgments.md): a skill with no placeholder to
 * run needs no shell, so it never fails for want of one.
 */
export async function render(run: Run, mode: Mode): Promise<Rendered> {
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
