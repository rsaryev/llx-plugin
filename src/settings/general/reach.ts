import type { PolicyScope } from '../layers.ts';

/**
 * Whose sessions a settings file reaches (settings.md, "Settings files and who they affect" and
 * "Compare the scope of each settings file"). The file kinds are the four a person can name; `flag`
 * and the rest are not files of a machine.
 */
export const FILE_SCOPES = [
  'user',
  'project',
  'local',
  'managed',
] as const satisfies readonly PolicyScope[];
export type FileScope = (typeof FILE_SCOPES)[number];

/** Whether a scope a host holds as a string is one of the four file scopes. */
export const isFileScope = (scope: string): scope is FileScope =>
  FILE_SCOPES.some((one) => one === scope);

/** What a host tells about the file besides its scope. */
export interface ReachFacts {
  /** The project file is committed to version control (a teammate's clone and a cloud session then get it). */
  readonly committed: boolean;
  /** The managed settings come from the claude.ai console (server-managed), not a file or an MDM policy. */
  readonly serverManaged: boolean;
}

export interface Reach {
  /** On your own machine: every project, or the one project the file sits in. */
  readonly yourMachine: 'every project' | 'this project';
  /** A teammate's machine, with their own clone of the project. */
  readonly teammate: boolean;
  /** A cloud session on the project. */
  readonly cloudSession: boolean;
}

interface ReachRule {
  readonly yourMachine: Reach['yourMachine'];
  readonly teammate: (facts: ReachFacts) => boolean;
  readonly cloudSession: (facts: ReachFacts) => boolean;
}

const never = (): boolean => false;
const whenCommitted = (facts: ReachFacts): boolean => facts.committed;

const REACH: { readonly [S in FileScope]: ReachRule } = {
  // "every project on your machine, and nothing on your teammate's or in the cloud session"
  user: { yourMachine: 'every project', teammate: never, cloudSession: never },
  // "reaches your teammate's clone and the cloud session only if you commit the file"
  project: { yourMachine: 'this project', teammate: whenCommitted, cloudSession: whenCommitted },
  // "your acme-app/ only"
  local: { yourMachine: 'this project', teammate: never, cloudSession: never },
  // "every project on every machine your organization deploys it to ... Only server-managed
  // settings reach the cloud session"
  managed: {
    yourMachine: 'every project',
    teammate: () => true,
    cloudSession: (facts) => facts.serverManaged,
  },
};

/** Where a setting saved in a file of this scope applies. */
export function reachOf(scope: FileScope, facts: ReachFacts): Reach {
  const rule = REACH[scope];
  return {
    yourMachine: rule.yourMachine,
    teammate: rule.teammate(facts),
    cloudSession: rule.cloudSession(facts),
  };
}
