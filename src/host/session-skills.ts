import { error, warning, type PluginIssue } from '../format/issues.ts';
import type { Command, Skill } from '../format/skill-types.ts';
import type { SlashCommand } from '../protocol/official.ts';
import { hookSessionGates } from '../settings/hooks/index.ts';
import { createSkillSettingsPolicy } from '../settings/skills/index.ts';
import { registerHooks, type RegisteredHandler } from '../hooks/index.ts';
import {
  admitSkillHooks,
  checkInvocation,
  expandSkill,
  hookSourceOf,
  NO_HOOKS_YET,
  type HookUsage,
  menuEntries,
  modelListing,
  type ExpandPorts,
  type Expansion,
  type Invocable,
  type Invoker,
  type ListingOptions,
  type ModelListingResult,
  type ShellPermission,
} from '../skills/index.ts';
import type { SkillHooksRegistrar } from './session-hooks.ts';
import type { ActivePlugin, HostState } from './state.ts';
import type { SessionOptions } from './types.ts';

/** Who asks for the skill: the user typing `/name`, or the model calling it. */
export type SkillInvoker = Extract<Invoker, 'user' | 'model'>;

export interface ExpandOptions {
  /** What follows the name: `$ARGUMENTS`, `$0`, `$name`. Default none. */
  readonly arguments?: string;
  readonly signal: AbortSignal;
  /** Default `user`: the skill is checked against `user-invocable`; `model` against `disable-model-invocation`. */
  readonly invoker?: SkillInvoker;
}

/** What the model is told and what the `/` menu offers; `usage`, `activated` and the budget as `modelListing`. */
export type SkillsOptions = Omit<ListingOptions, 'overrides'>;

export interface SkillsListing {
  readonly model: ModelListingResult;
  readonly menu: readonly SlashCommand[];
}

export interface SkillPart {
  skills(options?: SkillsOptions): SkillsListing;
  expandSkill(name: string, options: ExpandOptions): Promise<Expansion>;
}

interface Entry {
  readonly plugin: ActivePlugin;
  readonly invocable: Skill | Command;
}

/** Without an answer from the host a shell placeholder asks, and an `ask` aborts the expansion (skills.md, "Permission checks on injected commands"). */
const ASKS: ShellPermission = () => 'ask';

/**
 * A plugin's skill and command of one name are one entry, the command's: Claude Code 2.1.319 lists
 * `<plugin>:<name>` in `slash_commands` with the command's own `user-invocable`, whichever of the
 * two the plugin has under that name (spec/judgments.md, "oracle 2.1.319").
 */
const entriesOf = (state: HostState): readonly Entry[] =>
  state.active.flatMap((plugin) => {
    const commanded = new Set(plugin.catalog.commands.map((command) => command.command));
    const skills = plugin.catalog.skills.filter((skill) => !commanded.has(skill.command));
    return [...skills, ...plugin.catalog.commands].map((invocable) => ({ plugin, invocable }));
  });

function failed(name: string, message: string): Expansion {
  return { ok: false, issues: [error(`/${name}`, message)] };
}

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

function shellDisabled(state: HostState): boolean {
  const policy = createSkillSettingsPolicy(state.view, {
    ...state.parent,
    env: state.options.ports.environment.snapshot(),
  });
  return !policy.shell('plugin').run;
}

/**
 * hooks.md, "Hooks in skills and agents": a skill's hooks are registered when it is invoked and
 * keep running for the rest of the session; "Limits on skill hooks": each source of skills registers
 * at most 1,024 hooks and 16,384 matcher characters per session, and a skill past the limit
 * "registers none of its hooks". Judgment: invoking a skill again replaces its own hooks and counts
 * them once (spec/judgments.md).
 */
function skillHookRegistration(registrar: SkillHooksRegistrar) {
  const used = new Map<string, HookUsage>();
  const counted = new Map<string, HookUsage>();
  return (entry: Entry, hooks: NonNullable<Extract<Expansion, { ok: true }>['hooks']>) => {
    const source = hookSourceOf(entry.invocable.origin);
    const prefix = `skill:${entry.plugin.id}:${entry.invocable.command}`;
    const others = used.get(source) ?? NO_HOOKS_YET;
    const own = counted.get(prefix) ?? NO_HOOKS_YET;
    const base = {
      hooks: others.hooks - own.hooks,
      matcherChars: others.matcherChars - own.matcherChars,
    };
    const admission = admitSkillHooks(base, hooks);
    if (!admission.admitted) {
      return [
        warning(
          `/${entry.invocable.command}`,
          `Skill "${entry.invocable.command}" registers none of its hooks: ${source} is past its limit of 1,024 hooks or 16,384 matcher characters`,
        ),
      ];
    }
    used.set(source, admission.used);
    counted.set(prefix, {
      hooks: admission.used.hooks - base.hooks,
      matcherChars: admission.used.matcherChars - base.matcherChars,
    });
    const entries: readonly RegisteredHandler[] = registerHooks(hooks, {
      idPrefix: prefix,
      source: { kind: 'skill', label: '[skill]' },
      pluginId: entry.plugin.id,
    });
    registrar.registerSkillHooks(prefix, entries);
    return [] as readonly PluginIssue[];
  };
}

/** The expansion with the warnings of registering its hooks, when it has hooks to register. */
function withHooks(
  expansion: Expansion,
  register: (
    hooks: NonNullable<Extract<Expansion, { ok: true }>['hooks']>,
  ) => readonly PluginIssue[],
): Expansion {
  if (!expansion.ok || expansion.hooks === undefined) return expansion;
  const issues = register(expansion.hooks);
  return issues.length === 0
    ? expansion
    : { ...expansion, issues: [...expansion.issues, ...issues] };
}

export function createSkillPart(
  state: HostState,
  options: SessionOptions,
  registrar: SkillHooksRegistrar,
): SkillPart {
  const addHooks = skillHookRegistration(registrar);
  const { ports } = state.options;
  const windows = state.options.windows ?? false;
  const entries = entriesOf(state);
  const overrides = state.view.get('skillOverrides');
  const hooksLocked = hookSessionGates(state.view, state.parent).pluginOnlyHooks;
  const invocables: readonly Invocable[] = entries.map((entry) => entry.invocable);
  const expandPorts: ExpandPorts = {
    runner: ports.commands,
    locations: ports.locations,
    environment: ports.environment,
    permissions: options.permissions ?? ASKS,
  };
  return {
    skills: (listing = {}) => ({
      model: modelListing(invocables, { ...listing, ...(overrides && { overrides }) }),
      menu: menuEntries(invocables, overrides === undefined ? {} : { overrides }),
    }),
    async expandSkill(name, request) {
      const entry = entries.find((each) => each.invocable.command === name);
      if (entry === undefined) return failed(name, `Unknown skill: ${name}`);
      const invoker = request.invoker ?? 'user';
      const verdict = checkInvocation(entry.invocable, invoker, overrides);
      if (!verdict.allowed) return failed(name, verdict.message);
      const expansion = await expandSkill(
        entry.invocable,
        {
          arguments: request.arguments ?? '',
          sessionId: options.sessionId,
          ...(options.effort === undefined ? {} : { effort: options.effort.level }),
          permissionMode: options.permissionMode,
          disableShellExecution: shellDisabled(state),
          shells: state.options.shells ?? { bash: true, powershell: windows },
          context: { interactive: options.interactive ?? true, trigger: invoker },
          session: {
            pluginId: entry.plugin.id,
            userConfig: entry.plugin.userConfig,
            windows,
            ...(entry.plugin.source === undefined ? {} : { pluginSource: entry.plugin.source }),
          },
          policy: {
            hooksLockedToPlugins: hooksLocked,
            managedPermissionRulesOnly: managedPermissionRulesOnly(state),
          },
          cwd: options.cwd,
          signal: request.signal,
        },
        expandPorts,
      );
      return withHooks(expansion, (hooks) => addHooks(entry, hooks));
    },
  };
}
