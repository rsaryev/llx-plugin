import { error, warning, type PluginIssue } from '../format/issues.ts';
import {
  resolveNameConflict,
  type NameCandidate,
  type PluginOrigin,
} from '../marketplace/name-conflicts.ts';
import type { PolicyView } from '../settings/index.ts';
import { enabledPlugin } from '../settings/plugins/index.ts';
import type { HostPlugin } from './types.ts';
import { parsePluginId } from '../settings/plugins/plugin-id.ts';

/**
 * The plugins of one host generation or one session: which are given, under which id, and which of
 * those that share a manifest name runs (plugins/loading.md, "Find where a plugin came from", "Name
 * conflicts").
 */

/** The reserved origins of an id (`<name>@inline` and the rest); any other is a marketplace's. */
const RESERVED: Readonly<Record<string, PluginOrigin>> = {
  inline: 'session-only',
  'skills-dir': 'skills-dir',
  synced: 'synced',
};

/** Where a plugin came from, read from its id as the docs' table does. */
function originOf(id: string): PluginOrigin {
  const origin = parsePluginId(id)?.origin ?? '';
  return Object.hasOwn(RESERVED, origin) ? (RESERVED[origin] ?? 'installed') : 'installed';
}

/**
 * The host's plugins with a session's own over them: one under a host plugin's id replaces it, the
 * others are added after the host's (judgment, spec/judgments.md: a project or local install and a
 * `--plugin-dir` plugin are the session's, plugins/install.md and plugins/loading.md).
 */
export function layeredPlugins(
  host: readonly HostPlugin[],
  own: readonly HostPlugin[] | undefined,
): readonly HostPlugin[] {
  if (own === undefined) return host;
  const ids = new Set(own.map((entry) => entry.id));
  return [...host.filter((entry) => !ids.has(entry.id)), ...own];
}

/**
 * The plugins under distinct ids: the id names a plugin's hooks, options and `enabledPlugins` row,
 * so of two given under one id the first is kept and the other reported.
 */
export function distinctPlugins(plugins: readonly HostPlugin[]) {
  const ids = new Set<string>();
  const kept: HostPlugin[] = [];
  const issues: PluginIssue[] = [];
  for (const entry of plugins) {
    if (ids.has(entry.id)) {
      issues.push(
        error(entry.id, 'A plugin with this id was given before: this one is not loaded'),
      );
    } else {
      ids.add(entry.id);
      kept.push(entry);
    }
  }
  return { kept, issues };
}

export interface PluginRun {
  readonly entry: HostPlugin;
  readonly enabled: boolean;
}

/** One copy of a manifest name, as the conflict order reads it. */
const candidateOf = (view: PolicyView, run: PluginRun): NameCandidate => ({
  id: run.entry.id,
  name: run.entry.plugin.name,
  origin: originOf(run.entry.id),
  enabled: run.enabled,
  managedLocked: enabledPlugin(view, run.entry.id).decidedBy === 'managed',
});

/**
 * Which copies of each manifest name run. Copies from different origins follow the documented order
 * (managed, session-only, installed, skills-directory, synced); copies installed from different
 * marketplaces all stay enabled ("both appear as enabled", plugins/loading.md, "Hooks when two enabled
 * plugins share a name"). A copy that does not run is off, with its documented row as a warning.
 */
export function withNameConflicts(view: PolicyView, runs: readonly PluginRun[]) {
  const byName = new Map<string, PluginRun[]>();
  for (const run of runs)
    byName.set(run.entry.plugin.name, [...(byName.get(run.entry.plugin.name) ?? []), run]);
  const off = new Map<string, string | undefined>();
  for (const group of byName.values()) {
    if (group.length < 2) continue;
    const verdicts = resolveNameConflict(group.map((run) => candidateOf(view, run)));
    const winner = verdicts.find((verdict) => verdict.loads);
    const installedWins = winner !== undefined && originOf(winner.id) === 'installed';
    for (const verdict of verdicts) {
      const sameOrigin = installedWins && originOf(verdict.id) === 'installed';
      if (!verdict.loads && !sameOrigin) off.set(verdict.id, verdict.note);
    }
  }
  return {
    runs: runs.map((run) => (off.has(run.entry.id) ? { ...run, enabled: false } : run)),
    issues: [...off].flatMap(([id, note]) => (note === undefined ? [] : [warning(id, note)])),
  };
}
