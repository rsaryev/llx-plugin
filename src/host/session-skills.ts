import { error } from '../format/issues.ts';
import type { Command, Skill } from '../format/skill-types.ts';
import type { SlashCommand } from '../protocol/official.ts';
import { hookSessionGates } from '../settings/hooks/index.ts';
import { createSkillSettingsPolicy } from '../settings/skills/index.ts';
import {
  checkInvocation,
  expandSkill,
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

const entriesOf = (state: HostState): readonly Entry[] =>
  state.active.flatMap((plugin) =>
    [...plugin.catalog.skills, ...plugin.catalog.commands].map((invocable) => ({
      plugin,
      invocable,
    })),
  );

function failed(name: string, message: string): Expansion {
  return { ok: false, issues: [error(`/${name}`, message)] };
}

function shellDisabled(state: HostState): boolean {
  const policy = createSkillSettingsPolicy(state.view, {
    ...state.parent,
    env: state.options.ports.environment.snapshot(),
  });
  return !policy.shell('plugin').run;
}

export function createSkillPart(state: HostState, options: SessionOptions): SkillPart {
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
      return expandSkill(
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
          policy: { hooksLockedToPlugins: hooksLocked },
          cwd: options.cwd,
          signal: request.signal,
        },
        expandPorts,
      );
    },
  };
}
