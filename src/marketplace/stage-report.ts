import type { MarketplaceSource } from '../format/marketplace/types.ts';
import { notCached, PLUGINS_CHANGED } from './install-errors.ts';
import type { ErrorsTabEntry } from './install-messages.ts';
import type { InstallRecord } from './installed-plugins.ts';
import { sameMarketplaceSource, type KnownMarketplaces } from './known-marketplaces.ts';

/**
 * How far a plugin got (plugins/loading.md, "Check which stage a plugin reached"; plugins/
 * overview.md, "Make an installed plugin available in your session"): an `enabledPlugins` entry is
 * **declared** in settings, **fetched** to disk (`installed_plugins.json` records it and `cache/`
 * holds its files), and **loaded** in the running session, which "changes to settings or to disk
 * don't reach ... until you run `/reload-plugins` or start a new session". Pure over facts the host
 * reads: the settings, the records, which install paths exist, and the set the session loaded.
 */

export interface StageFacts {
  /** `<name>@<marketplace>`. */
  readonly id: string;
  /** Settings declare the plugin on (`enabledPlugins`, after precedence). */
  readonly enabled: boolean;
  /** Its install records, as `installed_plugins.json` lists them. */
  readonly records: readonly InstallRecord[];
  /** Which of the records' `installPath` exist on disk. */
  readonly existing: ReadonlySet<string>;
  /** A relative-path plugin of a marketplace added from a local path: it loads in place and needs no record. */
  readonly inPlace?: boolean;
  /** The plugin is in the set the session loaded at startup or at the last `/reload-plugins`. */
  readonly loaded: boolean;
}

export type Stage = 'none' | 'declared' | 'fetched' | 'loaded';

/** The three layers of overview.md: settings, disk and session. */
export type Layer = 'settings' | 'disk' | 'session';

export interface StageReport {
  readonly declared: boolean;
  /** `installed_plugins.json` has a record for it (or it loads in place). */
  readonly recorded: boolean;
  /** A directory its record points at exists (or it loads in place). */
  readonly cached: boolean;
  readonly loaded: boolean;
  /** The furthest stage reached. */
  readonly stage: Stage;
  /** Settings or disk differ from the session: `/reload-plugins` or a new session applies the change. */
  readonly reload: boolean;
  /** The layers it is not present at; empty when it is available in the session. */
  readonly missing: readonly Layer[];
  readonly available: boolean;
  /** `Plugin "<name>" not cached at <path>`, for an enabled plugin whose record points at nothing. */
  readonly problem?: ErrorsTabEntry;
}

type Reached = Pick<StageReport, 'declared' | 'recorded' | 'cached' | 'loaded' | 'reload'>;

/** The furthest stage first: a plugin is at the first stage whose test it passes. */
const STAGES: readonly (readonly [Stage, (reached: Reached) => boolean])[] = [
  ['loaded', (report) => report.loaded],
  ['fetched', (report) => report.cached],
  ['declared', (report) => report.declared],
];

const nameOf = (id: string): string => id.split('@')[0] ?? id;

const LAYERS: readonly (readonly [Layer, (reached: Reached) => boolean])[] = [
  ['settings', (report) => !report.declared],
  ['disk', (report) => !report.cached],
  ['session', (report) => !report.loaded],
];

/** `Plugin "<name>" not cached at <path>`: an enabled plugin whose record points at a directory that is gone. */
function missingCache(facts: StageFacts, reached: Reached): ErrorsTabEntry | undefined {
  const first = facts.records[0];
  const lost = facts.enabled && reached.recorded && !reached.cached;
  return lost && first !== undefined ? notCached(nameOf(facts.id), first.installPath) : undefined;
}

export function stageReport(facts: StageFacts): StageReport {
  const inPlace = facts.inPlace === true;
  const cached = inPlace || facts.records.some((one) => facts.existing.has(one.installPath));
  const base: Reached = {
    declared: facts.enabled,
    recorded: inPlace || facts.records.length > 0,
    cached,
    loaded: facts.loaded,
    reload: (facts.enabled && cached) !== facts.loaded,
  };
  const missing = LAYERS.filter(([, absent]) => absent(base)).map(([layer]) => layer);
  const problem = missingCache(facts, base);
  return {
    ...base,
    stage: STAGES.find(([, reached]) => reached(base))?.[0] ?? 'none',
    missing,
    available: missing.length === 0,
    ...(problem === undefined ? {} : { problem }),
  };
}

// ---- after the session starts ----

/** What Claude Code does after the session starts for a marketplace that settings declare. */
export type StartupAction =
  | {
      readonly marketplace: string;
      readonly action: 'clone';
      readonly source: MarketplaceSource;
      /** Next, plugins reload and enabled plugins that are not cached yet are downloaded. */
      readonly next: 'reload-and-download-enabled';
    }
  | {
      readonly marketplace: string;
      readonly action: 'refetch';
      readonly source: MarketplaceSource;
      readonly next: 'notify';
      readonly notice: string;
    };

/**
 * "Plugins load at session start from `installed_plugins.json` and the cache without using the
 * network. After the session starts, Claude Code checks the declared marketplaces in the
 * background": one `known_marketplaces.json` lacks is cloned (then it reloads plugins and downloads
 * the enabled ones not cached yet), and one whose source changed in settings is re-fetched from the
 * new source with `Plugins changed. Run /reload-plugins to activate.` Sources match as in
 * `sameMarketplaceSource`. A known marketplace that settings do not declare is not touched.
 */
export function planMarketplaceStartup(
  declared: Readonly<Record<string, MarketplaceSource>>,
  known: KnownMarketplaces,
): readonly StartupAction[] {
  return Object.entries(declared).flatMap(([marketplace, source]): StartupAction[] => {
    const existing = Object.hasOwn(known, marketplace) ? known[marketplace] : undefined;
    if (existing === undefined) {
      return [{ marketplace, action: 'clone', source, next: 'reload-and-download-enabled' }];
    }
    return sameMarketplaceSource(existing.source, source)
      ? []
      : [{ marketplace, action: 'refetch', source, next: 'notify', notice: PLUGINS_CHANGED }];
  });
}

/**
 * The `/plugin` Errors tab entries after the start: an enabled plugin that neither the clone nor
 * the re-fetch brought in (`fetchedAfterStart`) and that has no usable cache directory shows
 * `Plugin "<name>" not cached at <path>`.
 */
export function unresolvedAfterStart(
  plugins: readonly StageFacts[],
  fetchedAfterStart: ReadonlySet<string>,
): readonly ErrorsTabEntry[] {
  return plugins
    .filter((one) => !fetchedAfterStart.has(one.id))
    .flatMap((one) => stageReport(one).problem ?? []);
}
