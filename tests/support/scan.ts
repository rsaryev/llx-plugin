/**
 * Fixtures of the folder-scan tests: a disk in memory, the scan over it and the resolution of what
 * it found, for the home `/home/user`, the project `/work/app` and the managed directory
 * `/etc/claude-code`.
 */
import {
  createPluginHost,
  type HostPlugin,
  type PluginSession,
  type SessionOptions,
} from '../../src/host/index.ts';
import type { PolicyView } from '../../src/settings/index.ts';
import {
  resolveFolderSkills,
  scanFolders,
  type Resolution,
  type ScanOutcome,
  type ScanRequest,
} from '../../src/skills/index.ts';
import { SESSION } from './host.ts';
import {
  fakeEnvironment,
  folderScan,
  locations,
  scriptedRunner,
  type DiskEntry,
  type DiskOptions,
  type RunnerReply,
} from './ports.ts';

export const HOME = '/home/user';
export const PROJECT = '/work/app';
export const MANAGED = '/etc/claude-code';

/** A `SKILL.md` with a description and any extra frontmatter lines. */
export const skillText = (description: string, ...extra: readonly string[]): string =>
  ['---', `description: ${description}`, ...extra, '---', `Do the ${description} work.`].join('\n');

export interface Scenario {
  readonly request?: Partial<ScanRequest>;
  readonly disk?: DiskOptions;
  readonly taken?: readonly string[];
}

export function requestOf(scenario: Scenario): ScanRequest {
  return { home: HOME, cwd: PROJECT, ...scenario.request };
}

export function portOf(files: Readonly<Record<string, DiskEntry>>, scenario: Scenario = {}) {
  return folderScan(files, { managed: MANAGED, ...scenario.disk });
}

export async function scanOf(
  files: Readonly<Record<string, DiskEntry>>,
  scenario: Scenario = {},
): Promise<ScanOutcome> {
  return scanFolders({ folders: portOf(files, scenario), request: requestOf(scenario) });
}

/** The commands the kit lists after scanning and resolving, in listing order. */
export async function resolvedOf(
  files: Readonly<Record<string, DiskEntry>>,
  scenario: Scenario = {},
): Promise<Resolution & { readonly outcome: ScanOutcome }> {
  const outcome = await scanOf(files, scenario);
  const request = requestOf(scenario);
  const resolution = resolveFolderSkills(outcome.entries, {
    cwd: request.cwd,
    ...(request.addedDirectories === undefined
      ? {}
      : { addedDirectories: request.addedDirectories }),
    ...(scenario.taken === undefined ? {} : { taken: scenario.taken }),
  });
  return { ...resolution, outcome };
}

export const commandsOf = (resolution: Resolution): readonly string[] =>
  resolution.resolved.map((each) => each.invocable.command).toSorted();

export interface FolderHostFixture {
  readonly plugins?: readonly HostPlugin[];
  readonly settings?: PolicyView;
  readonly disk?: DiskOptions;
  readonly session?: Partial<SessionOptions>;
  readonly runs?: readonly RunnerReply[];
  readonly withoutFolders?: boolean;
}

/**
 * A host whose session reads the scope folders of `files`. The record is live: a test edits it and
 * calls `reloadSkills` again, as a person edits a folder.
 */
export function folderHostOf(files: Record<string, DiskEntry>, fixture: FolderHostFixture = {}) {
  const runner = scriptedRunner(...(fixture.runs ?? []));
  const host = createPluginHost({
    plugins: fixture.plugins ?? [],
    ports: {
      commands: runner,
      locations: locations({ home: HOME, project: PROJECT }),
      environment: fakeEnvironment(),
      ...(fixture.withoutFolders === true
        ? {}
        : { folders: folderScan(files, { managed: MANAGED, ...fixture.disk }) }),
    },
    ...(fixture.settings === undefined ? {} : { settings: fixture.settings }),
  });
  const session = host.openSession({ ...SESSION, ...fixture.session });
  return { host, session, runner };
}

/** The names of a session's `/` menu, sorted. */
export const menuOf = (session: PluginSession): readonly string[] =>
  session
    .skills()
    .menu.map((entry) => entry.name)
    .toSorted();
