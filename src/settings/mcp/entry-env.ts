import {
  BRACED_REFERENCE,
  isVariableName,
  resolveEnvReference,
  splitDefault,
  type EnvLookup,
} from '../../format/mcp-env.ts';
import type { PolicyView } from '../view.ts';
import { isRecord } from '../record.ts';
import type { McpList } from './entries.ts';

/**
 * The environment a policy entry expands in (managed-mcp.md, "Environment variables in `serverCommand`
 * and `serverUrl` entries"): a pinned one, "so a variable set by a project or user settings file can't
 * change what an allowlist entry means". Both lists read "the environment Claude Code started with,
 * plus `env` values from managed settings"; the denylist also fills "a variable with no startup value
 * and no `:-default`" from "settings files outside the repository, such as user or managed settings,
 * which only ever widens what the entry matches".
 *
 * Judgments (spec/judgments.md): the startup environment wins over a managed `env` value; "outside the
 * repository" is the managed, parent, `--settings` and user layers (project, local and `--add-dir`
 * files live in the folder), the highest layer winning per variable.
 */
type Env = Readonly<Record<string, string | undefined>>;

/** A lookup that reads own entries only, so `constructor` is a variable name and not a function. */
export const lookupIn =
  (env: Env): EnvLookup =>
  (name) =>
    Object.hasOwn(env, name) ? env[name] : undefined;

/** The `env` block of the layers of these scopes, each variable from the highest layer that sets it. */
function settingsEnv(view: PolicyView, scopes: readonly string[]): Env {
  const merged = new Map<string, string>();
  for (const layer of view.layers.toReversed()) {
    const block: unknown = layer.settings.env;
    if (!scopes.includes(layer.scope) || !isRecord(block)) continue;
    for (const [name, value] of Object.entries(block)) {
      if (typeof value === 'string') merged.set(name, value);
    }
  }
  return Object.fromEntries(merged);
}

/** How an entry's `${VAR}` text becomes the text it is matched as. */
export interface EntryExpansion {
  readonly expand: (text: string) => string;
}

const OUTSIDE_THE_REPOSITORY = ['managed', 'parent', 'flag', 'user'];

/** Expands one pass; a variable unset in `lookup` without a default is tried in each `fill`, then kept as written. */
function expandWithFill(text: string, lookup: EnvLookup, fill: readonly EnvLookup[]): string {
  return text.replace(BRACED_REFERENCE, (raw, inner: string) => {
    const reference = splitDefault(inner);
    if (!isVariableName(reference.name)) return raw;
    const resolved = resolveEnvReference(reference, lookup);
    if (!resolved.missing) return resolved.text;
    return fill.map((each) => each(reference.name)).find((found) => found !== undefined) ?? raw;
  });
}

/** The expansion of each list's entries over the layers and the environment Claude Code started with. */
export function entryExpansions(
  view: PolicyView,
  startup: Env,
): { readonly [L in McpList]: EntryExpansion } {
  const managed = lookupIn(settingsEnv(view, ['managed']));
  const started = lookupIn(startup);
  const pinned: EnvLookup = (name) => started(name) ?? managed(name);
  const outside = lookupIn(settingsEnv(view, OUTSIDE_THE_REPOSITORY));
  return {
    allowed: { expand: (text) => expandWithFill(text, pinned, []) },
    denied: { expand: (text) => expandWithFill(text, pinned, [outside]) },
  };
}
