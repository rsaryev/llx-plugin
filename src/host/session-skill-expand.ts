import { CONFIG_DIR_VARIABLE, configDirectoryOf } from '../format/config-directory.ts';
import { error } from '../format/issues.ts';
import type { Command, Skill, SkillShell } from '../format/skill-types.ts';
import { decide, parseRule, type DecideContext, type Decision } from '../rules/index.ts';
import { createSkillSettingsPolicy } from '../settings/skills/index.ts';

import {
  expandSkill,
  type ExpandSession,
  type Expansion,
  type Invoker,
  type ShellPermission,
  type Trigger,
} from '../skills/index.ts';
import type { PermissionBehavior } from '../protocol/official.ts';
import { currentOf, type SessionCore } from './session-core.ts';
import type { SessionDirectories } from './session-directories.ts';
import { portsOf, subprocessFor } from './session-environment.ts';
import type { Entry } from './session-skill-entries.ts';
import type { SessionOptions } from './session-types.ts';
import type { HostState } from './state.ts';
import type { HookSessionGates } from '../settings/hooks/session-gates.ts';

/** What fires the skill: the user typing `/name`, the model's Skill call, a scheduled fire, a workflow's agent. */
export type SkillInvoker = Trigger;

export interface ExpandOptions {
  /** What follows the name: `$ARGUMENTS`, `$0`, `$name`. Default none. */
  readonly arguments?: string;
  readonly signal: AbortSignal;
  /**
   * Default `user`: the skill is checked against `user-invocable`; `model` against
   * `disable-model-invocation`; `scheduled-task` as a scheduled fire; `workflow-agent` as the model.
   * A forked skill fired by a scheduled task or a workflow's agent waits for its result (skills.md,
   * "Run skills in a subagent").
   */
  readonly invoker?: SkillInvoker;
  /** The commands of the forked skills still running: one fired again waits for its result. */
  readonly runningForks?: ReadonlySet<string>;
  readonly bashOutputMaxChars?: number;
  readonly bare?: boolean;
  /**
   * The user's message names this skill after plain text (`go ahead and /deploy`): for the model's
   * invocation in that message it lifts `disable-model-invocation` (skills.md, "Where you write the
   * skill's name"). `session.expandMessage` says which names the message permits.
   */
  readonly permittedByMention?: boolean;
}

/**
 * Whose invocation policy a trigger is checked against. Judgment (spec/judgments.md): a workflow's
 * agent calls the Skill tool, so it is the model's.
 */
export const INVOKER_OF: { readonly [T in Trigger]: Invoker } = {
  user: 'user',
  model: 'model',
  'scheduled-task': 'scheduled-task',
  'workflow-agent': 'model',
};

/** An expansion that failed: also what a read of a skill's content returns when it fails. */
export type Failure = Extract<Expansion, { readonly ok: false }>;

export function failed(name: string, message: string): Failure {
  return { ok: false, issues: [error(`/${name}`, message)] };
}

/** The session effort `${CLAUDE_EFFORT}` falls back to, and the model limits, of the turn. */
const turnLimits = (options: SessionOptions) => ({
  ...(options.effort === undefined ? {} : { effort: options.effort.level }),
  ...(options.limits === undefined ? {} : { limits: options.limits }),
});

/**
 * `allowManagedPermissionRulesOnly` (settings-reference.md; Scope: Managed, Boolean): when managed
 * settings set it, a skill's `allowed-tools` from a project, personal, synced or skills-directory
 * source is ignored (skills.md, "When only managed permission rules apply"). Judgment: only a managed
 * layer counts, the parent settings of an embedding host do not (spec/judgments.md).
 */
const managedPermissionRulesOnly = (state: HostState): boolean =>
  state.view.layers.some(
    (layer) => layer.scope === 'managed' && layer.settings.allowManagedPermissionRulesOnly === true,
  );

/** The skill keys of the settings in force, with the turn's environment (`CLAUDE_CODE_DISABLE_*`). */
export const skillSettingsOf = (state: HostState, options: SessionOptions) =>
  createSkillSettingsPolicy(state.view, {
    ...state.parent,
    env: portsOf(state, options).environment.snapshot(),
  });

const shellDisabled = (state: HostState, options: SessionOptions): boolean =>
  !skillSettingsOf(state, options).shell('plugin').run;

/** `decide` has a classifier answer the kit cannot give: auto mode treats it as an ask (it defers). */
const BEHAVIOR_OF: { readonly [O in Decision['outcome']]: PermissionBehavior } = {
  allow: 'allow',
  ask: 'ask',
  deny: 'deny',
  classify: 'ask',
};

/**
 * The default answer for a skill's command (skills.md, "Permission checks on injected commands"):
 * `decide` over the session's rules with the skill's `allowed-tools` added as allow rules, so "Deny
 * and ask rules still override `allowed-tools`". A grant that does not parse grants nothing.
 */
function rulesPermission(context: DecideContext): ShellPermission {
  return (call) => {
    const grants = call.grants.flatMap(
      (text) => parseRule(text, { behavior: 'allow', source: { kind: 'session' } }).rule ?? [],
    );
    const decision = decide(
      { toolName: call.tool, input: { command: call.command } },
      { ...context, rules: [...context.rules, ...grants] },
    );
    return BEHAVIOR_OF[decision.outcome];
  };
}

/**
 * The session's own facts as a `DecideContext` when the host gave none (`SessionOptions.permissionContext`):
 * its mode, its rules, its directories and its configuration directory (`CLAUDE_CONFIG_DIR`, a protected
 * path). Judgment (spec/judgments.md): neither auto nor bypass mode is
 * assumed available.
 */
function sessionDecideContext(use: Use): DecideContext {
  const { options, directories, state } = use;
  const cwd = directories.cwd();
  const { locations, environment } = portsOf(state, options);
  const home = locations.homeDir();
  return {
    mode: options.permissionMode,
    rules: options.permissionRules ?? [],
    match: {
      paths: {
        cwd,
        home,
        primaryWorkingDirectory: cwd,
        additionalDirectories: [...(options.additionalDirectories ?? []), ...directories.added()],
        platform: state.options.windows === true ? 'windows' : 'posix',
      },
    },
    autoAvailable: false,
    bypassAvailable: false,
    interactive: options.interactive ?? true,
    protectedPaths: {
      configDirectory: configDirectoryOf(
        home,
        environment.get(CONFIG_DIR_VARIABLE),
        (base, relative) => locations.joinPath(base, relative),
      ),
    },
  };
}

/** What one use of the skill part reads: the session, the current state and gates, and the turn's options. */
export interface Use {
  readonly core: SessionCore;
  readonly state: HostState;
  readonly gates: HookSessionGates;
  readonly options: SessionOptions;
  readonly directories: SessionDirectories;
}

/** The body as the skill's file holds it now; a file the port refuses is the skill's failure, not a throw. */
async function bodyOf(entry: Entry, signal: AbortSignal): Promise<string | Failure> {
  const { command } = entry.invocable;
  try {
    const body = await entry.readBody(signal);
    return body ?? failed(command, 'The skill file is gone or no longer loads as a skill');
  } catch (cause) {
    if (signal.aborted) throw cause;
    return failed(command, `The skill file cannot be read: ${errorText(cause)}`);
  }
}

const errorText = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

/** The optional fields of a request, set only when the caller set them. */
const requestFields = (request: ExpandOptions) => ({
  ...(request.bashOutputMaxChars === undefined
    ? {}
    : { bashOutputMaxChars: request.bashOutputMaxChars }),
  ...(request.bare === undefined ? {} : { bare: request.bare }),
});

/**
 * The head with its place as the entry holds it, absolute: `${CLAUDE_SKILL_DIR}` is the row's
 * `directory`, computed once when the entries were built.
 */
const locatedOf = ({ invocable, file, directory }: Entry) => ({
  ...invocable,
  ...(file === undefined ? {} : { path: file }),
  ...(directory === undefined || !('dir' in invocable) ? {} : { dir: directory }),
});

/** The skill with its body as the file holds it now and its absolute place, or the failure. */
export async function contentOf(
  entry: Entry,
  signal: AbortSignal,
): Promise<Skill | Command | Failure> {
  const body = await bodyOf(entry, signal);
  return typeof body === 'string' ? { ...locatedOf(entry), body } : body;
}

/**
 * Folder skills have no plugin substitutions; plugin skills retain their configuration. The host's
 * one `shellPaths` sets how a `!` command writes its paths for the shell, its `shellArguments` how
 * it receives the arguments.
 */
function skillSession(
  entry: Entry,
  windows: boolean,
  shell: Pick<ExpandSession, 'shellPaths' | 'shellArguments'>,
): ExpandSession {
  const plugin = entry.plugin;
  const { shellPaths, shellArguments } = shell;
  const shared = {
    windows,
    ...(shellPaths === undefined ? {} : { shellPaths }),
    ...(shellArguments === undefined ? {} : { shellArguments }),
  };
  return plugin === undefined
    ? shared
    : {
        ...shared,
        pluginId: plugin.id,
        userConfig: plugin.userConfig,
        ...(plugin.source === undefined ? {} : { pluginSource: plugin.source }),
      };
}

export async function expansionOf(
  use: Use,
  entry: Entry,
  request: ExpandOptions,
): Promise<Expansion> {
  const content = await contentOf(entry, request.signal);
  if ('ok' in content) return content;
  const { core, state, gates, options } = use;
  const windows = state.options.windows ?? false;
  const cwd = use.directories.cwd();
  const turn = { ...options, cwd };
  return expandSkill(
    content,
    {
      arguments: request.arguments ?? '',
      sessionId: options.sessionId,
      ...turnLimits(options),
      permissionMode: options.permissionMode,
      disableShellExecution: shellDisabled(state, options),
      shells: state.options.shells ?? { bash: true, powershell: windows },
      context: {
        interactive: options.interactive ?? true,
        trigger: request.invoker ?? 'user',
        ...(request.runningForks === undefined ? {} : { runningForks: request.runningForks }),
      },
      session: skillSession(entry, windows, state.options),
      policy: {
        hooksLockedToPlugins: gates.pluginOnlyHooks,
        managedPermissionRulesOnly: managedPermissionRulesOnly(state),
      },
      cwd,
      commandEnvironment: (shell: SkillShell) => subprocessFor(core, turn, shell),
      ...requestFields(request),
      signal: request.signal,
    },
    expandPorts(use),
  );
}

/** The ports of the expansion: the turn's, and its shell answer or the rules' default one. */
function expandPorts(use: Use) {
  const ports = portsOf(use.state, use.options);
  return {
    runner: ports.commands,
    locations: ports.locations,
    environment: ports.environment,
    permissions:
      use.options.shellPermission ??
      rulesPermission(use.options.permissionContext ?? sessionDecideContext(use)),
    ...(ports.scratch === undefined ? {} : { scratch: ports.scratch }),
  };
}

/** The current state and gates of the session, for one use. */
export function useOf(
  core: SessionCore,
  options: SessionOptions,
  directories: SessionDirectories,
): Use {
  const { state, gates } = currentOf(core);
  return { core, state, gates, options, directories };
}
