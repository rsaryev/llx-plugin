import type { ShellPaths, SubstitutionScope } from './scope.ts';
import type { TokenReference } from './substitute.ts';
import { shellPathsOf } from './surfaces.ts';
import { isPluginVariable, type PluginVariable } from './variables.ts';

type Ask = (name: PluginVariable) => Promise<string>;

/** What the exports read from the scope: its `shellPaths` and the paths another layer owns. */
type ExportScope = Pick<SubstitutionScope, 'shellPaths' | 'extra' | 'extraPaths'>;

type Exported = (
  referenced: readonly TokenReference[],
  scope: ExportScope,
  ask: Ask,
) => Promise<Record<string, string>>;

/** The `extra` paths a string references (`SubstitutionScope.extraPaths`), with their values. */
function extraPathsOf(
  referenced: readonly TokenReference[],
  scope: ExportScope,
): [string, string][] {
  const paths = scope.extraPaths ?? [];
  return referenced.flatMap((token): [string, string][] => {
    if (!('name' in token) || !paths.includes(token.name)) return [];
    const value = scope.extra?.[token.name];
    return value === undefined ? [] : [[token.name, value]];
  });
}

/** The path variables a string references, as the host reports them (native paths). */
const referencedPaths: Exported = async (referenced, scope, ask) => {
  const names = [
    ...new Set(
      referenced.flatMap((token) =>
        'name' in token && isPluginVariable(token.name) ? [token.name] : [],
      ),
    ),
  ];
  const values = await Promise.all(names.map(ask));
  return {
    ...Object.fromEntries(names.map((name, at) => [name, values[at] ?? ''])),
    ...Object.fromEntries(extraPathsOf(referenced, scope)),
  };
};

/** A pasted path needs no environment; a reference needs the value it names. */
const EXPORTED: { readonly [M in ShellPaths]: Exported } = {
  pasted: () => Promise.resolve({}),
  'environment-reference': referencedPaths,
};

/**
 * What a string a shell parses needs in its process environment for the references
 * `SubstitutionScope.shellPaths` left in it: the path variables it references (and the `extra`
 * paths, `CLAUDE_SKILL_DIR`), nothing for pasted paths. The one rule for a monitor `command`, an
 * MCP `headersHelper` and a skill's `!` command, whose processes get no path variables of their own
 * (a hook's environment already carries all three). Pass the substituter's `variable` so the data
 * folder is asked for once.
 */
export const shellExports = (
  referenced: readonly TokenReference[],
  scope: ExportScope,
  ask: Ask,
): Promise<Record<string, string>> => EXPORTED[shellPathsOf(scope)](referenced, scope, ask);
