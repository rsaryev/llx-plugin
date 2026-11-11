import type { UiSurface } from '../../protocol/mods-ui-names.ts';
import { compareVersions, versionAtLeast } from '../../format/versions.ts';

/**
 * Where mods run (plugins/mods/overview.md, "Where mods run" and "Turn mods on or off"): for each
 * place Claude Code runs, whether a mod's hooks run and whether what it draws appears, and the
 * versions that load mods at all. Pure data and one rule per place; the host says where it is.
 */

/** The places of the docs' table (`claude -p` and the Agent SDK are one: `print`). */
export const MODS_APPS = [
  'terminal',
  'desktop',
  'desktop-wsl',
  'vscode',
  'print',
  'remote-control',
  'cloud',
] as const;
export type ModsApp = (typeof MODS_APPS)[number];

/** Where the session runs, as far as mods care. */
export interface ModsWhere {
  readonly app: ModsApp;
  /** The VS Code extension's version, for whether the panel draws. */
  readonly extensionVersion?: string;
  /** False for a session that does not fetch feature flags, such as one on Amazon Bedrock (default true). */
  readonly fetchesFeatureFlags?: boolean;
}

export interface WhereModsRun {
  /** Whether a mod's hooks run. */
  readonly hooksRun: boolean;
  /** Why they do not, when they do not. */
  readonly hooksReason?: string;
  /** Whether what a mod draws appears. */
  readonly draws: boolean;
  /** The app that shows it. */
  readonly drawsOn?: UiSurface;
  /** The Desktop app leaves out the elements the elements table marks terminal-only. */
  readonly terminalOnlyElementsHidden?: true;
}

/** What differs per place: the plugin's reach into the session matters in the cloud, the version in VS Code. */
interface Place {
  (input: ModsWhere & { readonly reachesCloud?: boolean }): WhereModsRun;
}

const RUNS_AND_DRAWS = (on: UiSurface): WhereModsRun => ({
  hooksRun: true,
  draws: true,
  drawsOn: on,
});
const RUNS_ONLY: WhereModsRun = { hooksRun: true, draws: false };

const MIN_VSCODE = '2.1.299';
/** "A session that doesn't fetch feature flags ... needs 2.1.304 or later." */
const MIN_VSCODE_WITHOUT_FLAGS = '2.1.304';

const vscode: Place = (input) => {
  const needed = input.fetchesFeatureFlags === false ? MIN_VSCODE_WITHOUT_FLAGS : MIN_VSCODE;
  const draws =
    input.extensionVersion !== undefined && versionAtLeast(input.extensionVersion, needed);
  return draws ? RUNS_AND_DRAWS('vscode') : RUNS_ONLY;
};

const PLACES: { readonly [A in ModsApp]: Place } = {
  terminal: () => RUNS_AND_DRAWS('terminal'),
  desktop: () => ({ ...RUNS_AND_DRAWS('desktop'), terminalOnlyElementsHidden: true }),
  'desktop-wsl': () => ({
    hooksRun: false,
    hooksReason: 'plugins are not available in WSL sessions of the Desktop app',
    draws: false,
  }),
  vscode,
  print: () => RUNS_ONLY,
  // "Yes, in the session on your machine" and "In the terminal on your machine".
  'remote-control': () => RUNS_AND_DRAWS('terminal'),
  cloud: (input) =>
    input.reachesCloud === true
      ? RUNS_ONLY
      : {
          hooksRun: false,
          hooksReason: 'the plugin does not reach the cloud session',
          draws: false,
        },
};

/** What `where` says about hooks and drawing; `reachesCloud` is whether the plugin reaches a cloud session. */
export function whereModsRun(where: ModsWhere & { readonly reachesCloud?: boolean }): WhereModsRun {
  return PLACES[where.app](where);
}

/** The first Claude Code that loads mods, by where it runs (overview.md, "Turn mods on or off"). */
export const MODS_MINIMUM_VERSION = { terminal: '2.1.287', desktop: '2.1.286' } as const;

/** What a version too old says, or `undefined` when mods load (wording ours, judgment). */
export function modsVersionProblem(
  app: keyof typeof MODS_MINIMUM_VERSION,
  version: string,
): string | undefined {
  const minimum = MODS_MINIMUM_VERSION[app];
  if (versionAtLeast(version, minimum)) return undefined;
  const found =
    compareVersions(version, minimum) === undefined
      ? `an unreadable version (${version})`
      : `v${version.replace(/^v/, '')}`;
  return `mods need Claude Code v${minimum} or later; this is ${found}`;
}
