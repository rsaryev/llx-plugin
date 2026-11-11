import type { AgentPart, AgentOverrides } from './session-agents.ts';
import { createAgentPart } from './session-agents.ts';
import { createSessionDirectories } from './session-directories.ts';
import { createFolderSkills } from './session-folders.ts';
import { hostEntriesOf, type HostSkill } from './session-host-skills.ts';
import { entriesOf } from './session-skill-entries.ts';
import type { HostState, HostStateSource } from './state.ts';
import type { SessionOptions } from './session-types.ts';

/**
 * The commands a synced skill's short name yields to: the host's own, the plugins' and the host
 * skills' (removed by `disableBundledSkills` or not: "including one that's unavailable in your
 * session", skills.md). The same array while the state and the host's list are the same.
 */
function takenCommands(stateOf: () => HostState, options: SessionOptions) {
  let last:
    | { state: HostState; host: readonly HostSkill[] | undefined; names: string[] }
    | undefined;
  return (): readonly string[] => {
    const state = stateOf();
    const host = options.hostSkills?.();
    if (last?.state === state && last.host === host) return last.names;
    const names = [
      ...(options.takenCommands ?? []),
      ...[...entriesOf(state), ...hostEntriesOf(host).entries].flatMap((entry) => entry.names),
    ];
    last = { state, host, names };
    return names;
  };
}

/** Scanned folders outlive a turn; state getters ensure host.update reaches their next use. */
export function createSessionContent(cell: HostStateSource, options: SessionOptions) {
  const directories = createSessionDirectories(options);
  const stateOf = () => cell.current();
  const folders = createFolderSkills(
    stateOf,
    options,
    directories,
    takenCommands(stateOf, options),
  );
  return { directories, folders, agents: createAgentPart(stateOf, options, directories) };
}
export type SessionContent = ReturnType<typeof createSessionContent>;

/** Turn-only agent facts do not mutate the scanned catalog or the original session options. */
export function agentsForView(base: AgentPart, options: SessionOptions): AgentPart {
  const defaults: AgentOverrides = {
    interactive: options.interactive ?? true,
    ...(options.permissionRules === undefined ? {} : { permissionRules: options.permissionRules }),
    ...(options.agents === undefined ? {} : { flag: options.agents }),
  };
  return {
    ...base,
    reloadAgents: (run) =>
      base.reloadAgents({ ...run, overrides: { ...defaults, ...run.overrides } }),
    agentCatalog: (overrides) => base.agentCatalog({ ...defaults, ...overrides }),
    selectAgent: (choice, overrides) => base.selectAgent(choice, { ...defaults, ...overrides }),
  };
}
