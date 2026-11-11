import type { FieldPolicy, SubstitutionScope } from './scope.ts';
import { runWith, type Substituted } from './substitute.ts';
import { PLUGIN_VARIABLES, pluginVariableValue, type PluginVariable } from './variables.ts';

export interface PreparedSubstituter {
  /** The same substitution as `Substituter.run`, without a port: every variable is known. */
  run(template: string, policy: FieldPolicy, path?: string): Substituted;
}

/**
 * A substituter for a host that substitutes synchronously (a lazily read Markdown body): the three
 * path variables are asked for once, here, and every `run` after is synchronous. Judgment
 * (spec/judgments.md): preparing asks for the data folder, so the folder is created when the host
 * prepares, not at the first reference.
 */
export async function prepareSubstituter(scope: SubstitutionScope): Promise<PreparedSubstituter> {
  const answers = new Map<PluginVariable, string>(
    await Promise.all(
      PLUGIN_VARIABLES.map(async (name) => [name, await pluginVariableValue(name, scope)] as const),
    ),
  );
  return {
    run: (template, policy, path = '') => runWith(template, policy, path, { scope, answers }),
  };
}
