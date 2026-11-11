import { readAgent } from '../../src/format/agent.ts';
import type { AgentRecord } from '../../src/format/agent-record.ts';
import { at, file, loaded } from './agent-files.ts';

/** The record `readAgent` makes of a project agent file with this frontmatter after `name`/`description`. */
export const agentWith = (extra: string): AgentRecord =>
  loaded(readAgent(file(`name: helper\ndescription: Helps\n${extra}`), at('project')));

/** The same, for an agent file, as the full result: the issues are in it. */
export const readWith = (extra: string) =>
  readAgent(file(`name: helper\ndescription: Helps\n${extra}`), at('project'));
