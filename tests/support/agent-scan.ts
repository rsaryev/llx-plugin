/** The agents scan over an in-memory disk, for the tests of `src/agents/catalog`. */
import { scanAgents, type AgentScanContext } from '../../src/agents/catalog/scan.ts';
import { folderScan } from '../../src/testing/ports/index.ts';
import { HOME, MANAGED, PROJECT } from './scan.ts';

/** An agent file with a name, a description and extra frontmatter lines. */
export const agent = (name: string, extra = ''): string =>
  `---\nname: ${name}\ndescription: ${name} agent\n${extra}---\nYou are ${name}.\n`;

export const scan = (
  files: Record<string, string>,
  context: Partial<AgentScanContext> & {
    readonly cwd?: string;
    readonly addedDirectories?: readonly string[];
    readonly repositories?: readonly string[];
  } = {},
) => {
  const { cwd, addedDirectories, repositories, ...rest } = context;
  return scanAgents({
    folders: folderScan(files, { managed: MANAGED, repositories: repositories ?? [] }),
    request: {
      home: HOME,
      cwd: cwd ?? PROJECT,
      ...(addedDirectories === undefined ? {} : { addedDirectories }),
    },
    ...rest,
  });
};

export const namesOf = (outcome: Awaited<ReturnType<typeof scan>>) =>
  outcome.entries.map((entry) => `${entry.agent.source}:${entry.agent.name}`).toSorted();
