import {
  locationsWithoutPlugin,
  SURFACE_POLICY,
  substituter,
  type FieldPolicy,
  type ResolvedUserConfig,
  type Substituted,
  type SubstitutionSurface,
  type SubstitutionScope,
} from '../../../loading/resolve/index.ts';
import type { RegisteredHandler } from '../../contracts.ts';
import type { RunContext } from '../context.ts';

/**
 * The placeholders of a command hook (hooks.md, "Reference scripts by path"): the substitution is
 * `loading/resolve`'s; this file only says which plugin, which user options and which policy a
 * handler gets.
 */

const NO_OPTIONS: ResolvedUserConfig = { declared: {}, values: {} };

/** What `${...}` in this handler's `command` and `args` resolve against. */
export function substitutionScope(
  entry: RegisteredHandler,
  context: RunContext,
): SubstitutionScope {
  const { pluginId } = entry;
  const { locations, environment } = context.ports;
  return {
    pluginId: pluginId ?? '',
    locations: pluginId === undefined ? locationsWithoutPlugin(locations) : locations,
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
function policyFor(
  entry: RegisteredHandler,
  surface: SubstitutionSurface,
  context: RunContext,
): FieldPolicy {
  const surfaced = SURFACE_POLICY[surface];
  // `shellPaths` (judgment): a bash command keeps its path variables as references the shell reads.
  const keepReferences = surface === 'hook-shell' && context.shellPaths === 'environment-reference';
  const policy: FieldPolicy = keepReferences ? { ...surfaced, paths: 'shell-reference' } : surfaced;
  return entry.pluginId === undefined ? { ...policy, userConfig: 'refuse' } : policy;
}

/** Substitutes the strings of one handler on one surface, asking the host for each folder once. */
export function handlerSubstituter(
  entry: RegisteredHandler,
  surface: SubstitutionSurface,
  context: RunContext,
): (template: string, path: string) => Promise<Substituted> {
  const substitution = substituter(substitutionScope(entry, context));
  const policy = policyFor(entry, surface, context);
  return (template, path) => substitution.run(template, policy, path);
}
