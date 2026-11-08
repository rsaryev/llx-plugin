import type { PluginIssue } from '../format/issues.ts';
import { openSession, type PluginSession } from './session.ts';
import { createHostState } from './state.ts';
import type { SessionOptions } from './session-types.ts';
import type { PluginHostOptions } from './types.ts';

/** A plugin the host knows and whether it runs. */
export interface HostedPlugin {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
}

export interface PluginHost {
  /** Every plugin the host was given, with whether it runs. */
  readonly plugins: readonly HostedPlugin[];
  /** What the format readers found wrong in the components of the plugins that run. */
  readonly issues: readonly PluginIssue[];
  openSession(options: SessionOptions): PluginSession;
}

/**
 * The public entry (docs/API.md, "Host and sessions"): the loaded plugins, the ports the host
 * implements and the settings, composed once. A session reads nothing again: it lists, expands,
 * dispatches hooks and resolves components over what the host already holds.
 */
export function createPluginHost(options: PluginHostOptions): PluginHost {
  const state = createHostState(options);
  return {
    plugins: state.all,
    issues: state.issues,
    openSession: (session) => openSession(state, session),
  };
}
