import {
  SURFACE_POLICY,
  substituter,
  type FieldPolicy,
  type ResolvedUserConfig,
  type Substituted,
  type Surface,
  type SubstitutionScope,
} from '../../../loading/resolve/index.ts';
import type { Locations } from '../../../ports/index.ts';
import type { RegisteredHandler } from '../../contracts.ts';
import type { RunContext } from '../context.ts';

/**
 * The placeholders of a command hook (hooks.md, "Reference scripts by path"): the substitution is
 * `loading/resolve`'s; this file only says which plugin, which user options and which policy a
 * handler gets.
 */

const NO_OPTIONS: ResolvedUserConfig = { declared: {}, values: {} };

/**
 * Judgment (spec/judgments.md): a handler of no plugin (a settings file's) has no plugin folder
 * and no data folder, so the two plugin variables stay as written instead of naming the folder of
 * a plugin that is not there. The docs show these two only in plugin hooks. Every method
 * delegates, since a host's `Locations` may be a class instance.
 */
function withoutPlugin(locations: Locations): Locations {
  return {
    homeDir: () => locations.homeDir(),
    projectDir: () => locations.projectDir(),
    pluginRoot: () => '${CLAUDE_PLUGIN_ROOT}',
    pluginData: () => Promise.resolve('${CLAUDE_PLUGIN_DATA}'),
    joinPath: (base, relativePath) => locations.joinPath(base, relativePath),
    existingDirectory: (candidates, signal) => locations.existingDirectory(candidates, signal),
  };
}

/** What `${...}` in this handler's `command` and `args` resolve against. */
export function substitutionScope(
  entry: RegisteredHandler,
  context: RunContext,
): SubstitutionScope {
  const { pluginId } = entry;
  const { locations, environment } = context.ports;
  return {
    pluginId: pluginId ?? '',
    locations: pluginId === undefined ? withoutPlugin(locations) : locations,
    environment,
    userConfig:
      pluginId === undefined ? NO_OPTIONS : (context.userConfigOf?.(pluginId) ?? NO_OPTIONS),
    windows: context.windows,
    signal: context.signal,
  };
}

/**
 * "Plugin hooks additionally substitute `${user_config.*}` values": a handler of no plugin keeps
 * the reference as written.
 */
function policyFor(entry: RegisteredHandler, surface: Surface): FieldPolicy {
  const policy = SURFACE_POLICY[surface];
  return entry.pluginId === undefined ? { ...policy, userConfig: 'refuse' } : policy;
}

/** Substitutes the strings of one handler on one surface, asking the host for each folder once. */
export function handlerSubstituter(
  entry: RegisteredHandler,
  surface: Surface,
  context: RunContext,
): (template: string, path: string) => Promise<Substituted> {
  const substitution = substituter(substitutionScope(entry, context));
  const policy = policyFor(entry, surface);
  return (template, path) => substitution.run(template, policy, path);
}
