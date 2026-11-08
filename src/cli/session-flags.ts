import { usageError, type UsageError } from './result.ts';
import { FLAG_STRATEGIES } from './flags/registry.ts';
import { pluginDirsVariableRefusal } from './flags/sideload.ts';
import {
  FLAG_NAMES,
  type Contribution,
  type FlagContext,
  type FlagFacts,
  type FlagName,
  type GivenFlags,
  type SessionPlan,
} from './flags/types.ts';

/**
 * The flags of one `claude` run as a plan (cli-reference.md, "CLI flags"; plugins/cli-reference.md,
 * "Flags that load a plugin for one session"). Each flag is a strategy over `FlagName`
 * (`flags/registry.ts`); the plan is what they add up to, handed to the modules that own each
 * behaviour: settings layers, session plugins, the tool filter, the permission mode, the agents,
 * the channel verdict, the MCP sources. Pure over what the host parsed and read. A plan with
 * `refusals` is a run that exits `1` without starting.
 */

const EMPTY: SessionPlan = {
  refusals: [],
  warnings: [],
  sessionPlugins: [],
  skipped: [],
  env: {},
  additionalDirectories: [],
  forwardSubagentText: false,
  channels: [],
  mcpConfigs: [],
  strictMcpConfig: false,
  optsIntoTaskTools: false,
  restricted: false,
  fileToolsConfined: false,
  cloudSessions: 'allowed',
  addDirLoads: [],
};

/** Two flags that each name a set of settings scopes leave the scopes both name. */
function scopesOf(
  before: SessionPlan['settingScopes'],
  added: SessionPlan['settingScopes'],
): Pick<SessionPlan, 'settingScopes'> {
  if (added === undefined) return before === undefined ? {} : { settingScopes: before };
  return { settingScopes: before === undefined ? added : before.filter((s) => added.includes(s)) };
}

/** What `added` changes: lists grow, a scalar replaces, scopes intersect. */
function combine(plan: SessionPlan, added: Contribution): SessionPlan {
  return {
    ...plan,
    ...added,
    refusals: [...plan.refusals, ...(added.refusals ?? [])],
    warnings: [...plan.warnings, ...(added.warnings ?? [])],
    sessionPlugins: [...plan.sessionPlugins, ...(added.sessionPlugins ?? [])],
    skipped: [...new Set([...plan.skipped, ...(added.skipped ?? [])])],
    env: { ...plan.env, ...added.env },
    additionalDirectories: [...plan.additionalDirectories, ...(added.additionalDirectories ?? [])],
    channels: [...plan.channels, ...(added.channels ?? [])],
    mcpConfigs: [...plan.mcpConfigs, ...(added.mcpConfigs ?? [])],
    ...scopesOf(plan.settingScopes, added.settingScopes),
  };
}

// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- `F` ties the flag's name to the strategy and the value it takes
function runFlag<F extends FlagName>(name: F, context: FlagContext): Contribution {
  const value = context.given[name];
  return value === undefined ? {} : FLAG_STRATEGIES[name](value, context);
}

/** What the flags a run was given add up to, in the order of `FLAG_NAMES`. */
export function planSessionFlags(given: GivenFlags, facts: FlagFacts): SessionPlan {
  const context: FlagContext = { given, facts };
  const flagged = FLAG_NAMES.reduce<SessionPlan>(
    (plan, name) => combine(plan, runFlag(name, context)),
    EMPTY,
  );
  const variable = pluginDirsVariableRefusal(facts);
  return variable === undefined ? flagged : combine(flagged, { refusals: [variable] });
}

/** What the run ends with when the plan refuses it: exit `1`, the reasons on stderr, no result line. */
export const startupRefusal = (plan: SessionPlan): UsageError | undefined =>
  plan.refusals.length === 0 ? undefined : usageError(plan.refusals.join('\n'));
