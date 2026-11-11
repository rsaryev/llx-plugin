import { VARIABLE_FIELDS, type ExportedVariable, type VariableComponent } from './field-map.ts';
import type { SubstitutionScope } from './scope.ts';
import { optionEnvironment } from './user-config.ts';
import type { Substituter } from './substituter.ts';
import { pluginVariableValue, type PluginVariable } from './variables.ts';

/** Where a path variable's value comes from: the substituter of the component's strings, when there is one. */
type Ask = Pick<Substituter, 'variable'>['variable'];

type Exporter = (scope: SubstitutionScope, ask: Ask) => Promise<Record<string, string>>;

const path =
  (name: PluginVariable): Exporter =>
  async (_scope, ask) => ({ [name]: await ask(name) });

const EXPORTERS: { readonly [E in ExportedVariable]: Exporter } = {
  CLAUDE_PLUGIN_ROOT: path('CLAUDE_PLUGIN_ROOT'),
  CLAUDE_PLUGIN_DATA: path('CLAUDE_PLUGIN_DATA'),
  CLAUDE_PROJECT_DIR: path('CLAUDE_PROJECT_DIR'),
  'CLAUDE_PLUGIN_OPTION_<KEY>': (scope) => Promise.resolve(optionEnvironment(scope.userConfig)),
};

/**
 * The environment variables a component's process receives (the "Exported to the process" column):
 * the host adds them to the process it starts. Paths are as the host reports them, native: a
 * Windows process reads backslashes (judgment: the docs state the forward-slash rule for text, not
 * for the environment). The data folder is asked for only by a component that exports it; pass the
 * `substituter` of the component's strings so it is asked once for both.
 */
export async function exportedEnvironment(
  component: VariableComponent,
  scope: SubstitutionScope,
  substitution?: Pick<Substituter, 'variable'>,
): Promise<Record<string, string>> {
  const ask: Ask = substitution?.variable ?? ((name) => pluginVariableValue(name, scope));
  const parts = await Promise.all(
    VARIABLE_FIELDS[component].exported.map((variable) => EXPORTERS[variable](scope, ask)),
  );
  return Object.assign({}, ...parts);
}
