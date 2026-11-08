import { VARIABLE_FIELDS, type ExportedVariable, type VariableComponent } from './field-map.ts';
import type { SubstitutionScope } from './scope.ts';
import { optionEnvironment } from './user-config.ts';
import { pluginVariableValue } from './variables.ts';

type Exporter = (scope: SubstitutionScope) => Promise<Record<string, string>>;

const path =
  (name: 'CLAUDE_PLUGIN_ROOT' | 'CLAUDE_PLUGIN_DATA' | 'CLAUDE_PROJECT_DIR'): Exporter =>
  async (scope) => ({ [name]: await pluginVariableValue(name, scope) });

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
 * for the environment). The data folder is asked for only by a component that exports it.
 */
export async function exportedEnvironment(
  component: VariableComponent,
  scope: SubstitutionScope,
): Promise<Record<string, string>> {
  const parts = await Promise.all(
    VARIABLE_FIELDS[component].exported.map((variable) => EXPORTERS[variable](scope)),
  );
  return Object.assign({}, ...parts);
}
