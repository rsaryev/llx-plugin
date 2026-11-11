import type { FieldPolicy, SubstitutionScope } from './scope.ts';
import { neededVariables, runWith, type Substituted } from './substitute.ts';
import { pluginVariableValue, type PluginVariable } from './variables.ts';

export interface Substituter {
  /** What the references resolve against. */
  readonly scope: SubstitutionScope;
  /** `path` names the field in the issues. */
  run(template: string, policy: FieldPolicy, path?: string): Promise<Substituted>;
  /** The variable's path as the host reported it, asked once per substituter (`exportedEnvironment`). */
  readonly variable: (name: PluginVariable) => Promise<string>;
}

/**
 * A substituter keeps what the host answered for the variables, so several strings of one
 * component (a server's `command`, `args` and `env`) ask for the data folder once, and only a
 * string that writes a variable's path asks for it.
 */
export function substituter(scope: SubstitutionScope): Substituter {
  const answers = new Map<PluginVariable, string>();
  const asked = new Map<PluginVariable, Promise<string>>();
  const variable = (name: PluginVariable): Promise<string> => {
    const known = asked.get(name);
    if (known) return known;
    const asking = pluginVariableValue(name, scope);
    asked.set(name, asking);
    // A host that failed is asked again by the next string, not answered with its old failure.
    asking.catch(() => asked.delete(name));
    return asking;
  };
  const ask = async (name: PluginVariable): Promise<void> => {
    answers.set(name, await variable(name));
  };
  return {
    scope,
    async run(template, policy, path = '') {
      await Promise.all(neededVariables(template, scope, policy).map(ask));
      return runWith(template, policy, path, { scope, answers });
    },
    variable,
  };
}

export const substituteTemplate = (
  template: string,
  scope: SubstitutionScope,
  policy: FieldPolicy,
  path = '',
): Promise<Substituted> => substituter(scope).run(template, policy, path);
