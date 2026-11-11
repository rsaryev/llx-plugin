import { REPOSITORY_FILES } from '../key-spec.ts';
import { SUBPROCESS_ONLY, type EnvResolution } from './resolve-env.ts';

/**
 * When Claude Code applies `env` values again (settings-reference.md, "When Claude Code applies `env`
 * values"; env-vars.md, "Set variables in settings files"): in a running session when a saved change
 * alters the merged `env`, and after `/cd` with the new directory's project and local values.
 */
export interface EnvChange {
  /** The new and the changed variables: what the running session writes into its environment. */
  readonly set: Readonly<Record<string, string>>;
  /**
   * The variables the new `env` no longer holds. "Removing a variable from the file doesn't unset it
   * in a running session; the removal takes effect the next time you launch `claude`."
   */
  readonly keptUntilRelaunch: readonly string[];
}

/** What a saved change to the `env` of the files does to a running session. */
export function envChange(
  applied: Readonly<Record<string, string>>,
  next: Readonly<Record<string, string>>,
): EnvChange {
  return {
    set: Object.fromEntries(
      Object.entries(next).filter(([name, value]) => applied[name] !== value),
    ),
    keptUntilRelaunch: Object.keys(applied).filter((name) => !Object.hasOwn(next, name)),
  };
}

/**
 * The session after `/cd` (permissions.md, "Move the session to another directory"; Claude Code
 * v2.1.246 or later): "the new directory's project and local `env` values, on top of the previous
 * directory's". `entered` is the resolution for the new directory's layers; its user, managed and
 * `--settings` values were applied at startup and stay as they are.
 */
export function envAfterCd(previous: EnvResolution, entered: EnvResolution): EnvResolution {
  const fromRepository = (name: string): boolean => {
    const scope = entered.origin[name];
    return scope !== undefined && REPOSITORY_FILES.includes(scope);
  };
  const added = Object.fromEntries(
    Object.entries(entered.settings).filter(([name]) => fromRepository(name)),
  );
  const own = Object.fromEntries(
    Object.entries(added).filter(([name]) => !SUBPROCESS_ONLY.includes(name)),
  );
  return {
    settings: { ...previous.settings, ...added },
    origin: {
      ...previous.origin,
      ...Object.fromEntries(
        Object.keys(added).map((name) => [name, entered.origin[name] ?? 'project']),
      ),
    },
    process: { ...previous.process, ...own },
    subprocess: { ...previous.subprocess, ...added },
    notApplied: [...previous.notApplied, ...entered.notApplied],
  };
}
