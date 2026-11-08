import type { AgentPart, AgentOverrides } from './session-agents.ts';
import { createAgentPart } from './session-agents.ts';
import { createSessionDirectories } from './session-directories.ts';
import { createFolderSkills } from './session-folders.ts';
import { entriesOf } from './session-skill-entries.ts';
import type { HostStateCell } from './state.ts';
import type { SessionOptions } from './session-types.ts';

/** Scanned folders outlive a turn; state getters ensure host.update reaches their next use. */
export function createSessionContent(cell: HostStateCell, options: SessionOptions) {
  const directories = createSessionDirectories(options);
  const stateOf = () => cell.current();
  const folders = createFolderSkills(stateOf, directories, () => [
    ...(options.takenCommands ?? []),
    ...entriesOf(stateOf()).flatMap((entry) => entry.names),
  ]);
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
