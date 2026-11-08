import type { PluginIssue } from '../format/issues.ts';
import { openSession, type PluginSession } from './session.ts';
import { createHostState, createStateCell, mergeHostOptions } from './state.ts';
import type { SessionOptions } from './session-types.ts';
import type { HostedPlugin, HostUpdate, PluginHostOptions } from './types.ts';

/** What `host.update` reports: the plugins and issues the host has now. */
export interface UpdateResult {
  readonly plugins: readonly HostedPlugin[];
  readonly issues: readonly PluginIssue[];
}

export interface PluginHost {
  /** Every plugin the host was given, with whether it runs; the current list, live. */
  readonly plugins: readonly HostedPlugin[];
  /** What the format readers found wrong in the components of the plugins that run; live. */
  readonly issues: readonly PluginIssue[];
  /** How many times `update` ran: a caller that kept the number sees that the host changed. */
  readonly generation: number;
  /**
   * Replaces the plugins, settings, parent settings and saved `userConfig` the update gives, as a
   * whole each, and keeps the rest and the ports (docs/API.md, "Updating"). Every session already
   * open, and every `withTurn` view of it, reads the new state at its next use.
   */
  update(update: HostUpdate): UpdateResult;
  openSession(options: SessionOptions): PluginSession;
}

/**
 * The public entry (docs/API.md, "Host and sessions"): the loaded plugins, the ports the host
 * implements and the settings, composed once and replaced by `update`. A session reads nothing from
 * disk: it lists, expands, dispatches hooks and resolves components over what the host holds now.
 */
export function createPluginHost(options: PluginHostOptions): PluginHost {
  let merged = options;
  let generation = 0;
  const cell = createStateCell(createHostState(merged));
  return {
    get plugins() {
      return cell.current().all;
    },
    get issues() {
      return cell.current().issues;
    },
    get generation() {
      return generation;
    },
    update(update) {
      const next = mergeHostOptions(merged, update);
      const state = createHostState(next);
      merged = next;
      cell.set(state);
      generation += 1;
      return { plugins: cell.current().all, issues: cell.current().issues };
    },
    openSession: (session) => openSession(cell, session),
  };
}
