import { error, type PluginIssue } from '../issues.ts';
import { isPluginIdPart } from './ids.ts';

/**
 * The `renames` map of `marketplace.json` (plugins/host-marketplace.md, "Migrate users with a
 * renames map"; plugins/marketplace-reference.md, "Validation messages"): each former plugin name
 * maps to its current name, or to `null` for a plugin that is gone. "Claude Code follows the chain
 * from the oldest name", so a name may map to a name that is itself a key, and the chain must end
 * at `null` or at a name in `plugins` (`claude plugin validate` rejects one that cycles or ends
 * anywhere else).
 */
export type Renames = Readonly<Record<string, string | null>>;

/**
 * Where a chain from `start` ends. `plugins` is checked before the keys: a name that is still a
 * plugin is where users end up (judgment, spec/judgments.md). Keys are read as own properties only,
 * so `constructor` or `__proto__` in a map or a target is a plain name.
 */
export type Chain =
  | { readonly end: 'plugin'; readonly name: string }
  | { readonly end: 'removed' }
  | { readonly end: 'dangling'; readonly name: string }
  | { readonly end: 'cycle'; readonly path: readonly string[] };

const isKey = (renames: Renames, name: string): boolean => Object.hasOwn(renames, name);

export function followRenames(
  renames: Renames,
  start: string,
  plugins: ReadonlySet<string>,
): Chain {
  const path = [start];
  let current = start;
  for (;;) {
    const target = renames[current];
    if (target === undefined || target === null) return { end: 'removed' };
    if (plugins.has(target)) return { end: 'plugin', name: target };
    if (!isKey(renames, target)) return { end: 'dangling', name: target };
    if (path.includes(target)) return { end: 'cycle', path: [...path, target] };
    path.push(target);
    current = target;
  }
}

const UNRESOLVED_TARGET = 'target must be a name in plugins[], a key in renames, or null';

/** The reason an unresolved chain gives (judgment: the docs leave the text in the parentheses open). */
function reasonOf(chain: Extract<Chain, { end: 'dangling' | 'cycle' }>): string {
  return chain.end === 'cycle'
    ? `cycle: ${chain.path.join(' -> ')}`
    : `ends at "${chain.name}", which is not in plugins[]`;
}

/**
 * What `claude plugin validate` reports about `renames`, on `renames.<old>`: a target that is not a
 * valid plugin name, and a chain that cycles or ends at a name that is neither a plugin nor a key.
 */
export function validateRenames(renames: Renames, pluginNames: readonly string[]): PluginIssue[] {
  const plugins = new Set(pluginNames);
  const found: PluginIssue[] = [];
  for (const [old, target] of Object.entries(renames)) {
    const path = `renames.${old}`;
    if (target !== null && !isPluginIdPart(target)) {
      found.push(error(path, `target "${target}" is not a valid plugin name (PluginIdSchema)`));
      continue;
    }
    const chain = followRenames(renames, old, plugins);
    if (chain.end === 'cycle' || chain.end === 'dangling') {
      found.push(error(path, `chain does not resolve (${reasonOf(chain)}) — ${UNRESOLVED_TARGET}`));
    }
  }
  return found;
}
