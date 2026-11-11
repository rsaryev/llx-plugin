import { warning, type PluginIssue } from '../../format/issues.ts';
import {
  BRACED_REFERENCE,
  isVariableName,
  missingVariableMessage,
  resolveEnvReference,
  splitDefault,
} from '../../format/mcp-env.ts';
import type {
  EnvironmentExpansion,
  FieldPolicy,
  SubstitutionScope,
  UserConfigPolicy,
} from './scope.ts';
import { userConfigText, userConfigValue, type UserConfigValue } from './user-config.ts';
import { validOptionKeyIn } from '../../format/user-config-refs.ts';
import { isPluginVariable, renderingNeedsValue, renderPluginVariable } from './variables.ts';
import type { PluginVariable } from './variables.ts';

/**
 * Substitution of `${...}` in one string. One pass over the original text: a substituted value is
 * never scanned again (skills.md, "Available string substitutions"), so a saved option holding
 * `${CLAUDE_PLUGIN_ROOT}` stays that text.
 *
 * Grammar (judgment: the docs name the forms, not the edges): a reference is `${` name `}` with no
 * braces inside; a `${VAR:-default}` default ends at the first `}` and nests nothing; there is no
 * escape (a backslash does not prevent a `${CLAUDE_*}` variable, skills.md); anything that is not
 * a known reference is left as written.
 */

/** What a template referenced, in order of first appearance, once each. */
export type TokenReference =
  | { readonly kind: 'path-variable'; readonly name: PluginVariable }
  | { readonly kind: 'user-config'; readonly key: string }
  | { readonly kind: 'environment'; readonly name: string }
  | { readonly kind: 'extra'; readonly name: string };

export interface Substituted {
  readonly text: string;
  /** Warnings only: an unresolved reference stays as written and is reported. */
  readonly issues: readonly PluginIssue[];
  readonly referenced: readonly TokenReference[];
  /**
   * What stayed as written because nothing answered it: the names of `${VAR}` references with no
   * value and no default, and the keys of `${user_config.KEY}` references with no value or no
   * declaration. A caller that treats them as an error (an MCP server that cannot start) reads them here
   * instead of from the warning text.
   */
  readonly unresolved: Unresolved;
}

export interface Unresolved {
  readonly variables: readonly string[];
  readonly options: readonly string[];
}

/** The text a reference becomes, or why it stayed as written (`problem`). */
interface Resolution {
  readonly text: string;
  readonly problem?: string;
  readonly unresolved?: Partial<{ variable: string; option: string }>;
}

interface Token {
  readonly reference: TokenReference;
  resolve(): Resolution;
  /** The path variable a path-variable reference names: what the host is asked for. */
  readonly variable?: PluginVariable;
}

interface Context {
  readonly scope: SubstitutionScope;
  readonly policy: FieldPolicy;
  /** The variable as the host reported it; only the ones a rendering needs are asked for. */
  variable(name: PluginVariable): string;
}

type TokenParser = (inner: string, context: Context) => Token | undefined;

type Disposition = 'substitute' | 'placeholder' | 'keep';

/** Whether a field takes a value, by whether the option is sensitive. */
const DISPOSITIONS: {
  readonly [P in UserConfigPolicy]: (sensitive: boolean) => Disposition;
} = {
  allow: () => 'substitute',
  'non-sensitive': (sensitive) => (sensitive ? 'placeholder' : 'substitute'),
  refuse: () => 'keep',
};

/**
 * What stands for a sensitive value in skill, command and agent content, where "a sensitive value
 * there becomes a placeholder" (plugins/manifest-reference.md). The docs give no text; Claude Code
 * 2.1.319 sends the model this one, a command's body included, saved value or not
 * (`bun run oracle:model-content`).
 */
export const SENSITIVE_PLACEHOLDER = (key: string): string =>
  `[sensitive option '${key}' not available in skill content]`;

const RENDERINGS: {
  readonly [D in Disposition]: (raw: string, key: string, value: UserConfigValue) => string;
} = {
  substitute: (_raw, _key, value) => userConfigText(value),
  placeholder: (_raw, key) => SENSITIVE_PLACEHOLDER(key),
  keep: (raw) => raw,
};

const userConfigToken: TokenParser = (inner, { scope, policy }) => {
  const key = validOptionKeyIn(inner);
  if (key === undefined) return undefined;
  const raw = `\${${inner}}`;
  const declared = scope.userConfig.declared[key];
  const disposition = DISPOSITIONS[policy.userConfig](declared?.sensitive === true);
  return {
    reference: { kind: 'user-config', key },
    resolve: () => {
      // A sensitive option is never shown, so whether it has a value does not matter (oracle).
      if (disposition === 'placeholder') return { text: SENSITIVE_PLACEHOLDER(key) };
      const value = userConfigValue(scope.userConfig, key);
      if (value === undefined && disposition !== 'keep') {
        const why = declared === undefined ? 'is not declared in userConfig' : 'has no value';
        return {
          text: raw,
          problem: `\${user_config.${key}} ${why}`,
          unresolved: { option: key },
        };
      }
      const text = value === undefined ? raw : RENDERINGS[disposition](raw, key, value);
      return { text };
    },
  };
};

const pathVariableToken: TokenParser = (inner, context) => {
  // Judgment: a path variable always resolves, so a `:-default` written after it is ignored.
  const { name } = splitDefault(inner);
  if (!isPluginVariable(name)) return undefined;
  const { policy, scope } = context;
  return {
    reference: { kind: 'path-variable', name },
    variable: name,
    resolve: () => ({
      text: renderPluginVariable(
        policy.paths,
        name,
        renderingNeedsValue(policy.paths) ? context.variable(name) : '',
        scope.windows,
      ),
    }),
  };
};

/** An `extra` path (`SubstitutionScope.extraPaths`) is written as the policy writes a path. */
const extraText = (name: string, value: string, { scope, policy }: Context): string =>
  scope.extraPaths?.includes(name) === true
    ? renderPluginVariable(policy.paths, name, value, scope.windows)
    : value;

const extraToken: TokenParser = (inner, context) => {
  const { name } = splitDefault(inner);
  const extra = context.scope.extra;
  const value = extra !== undefined && Object.hasOwn(extra, name) ? extra[name] : undefined;
  return value === undefined
    ? undefined
    : {
        reference: { kind: 'extra', name },
        resolve: () => ({ text: extraText(name, value, context) }),
      };
};

const EXPANDS: { readonly [E in EnvironmentExpansion]: boolean } = {
  expand: true,
  literal: false,
};

/** The rule is `format/mcp-env`'s, the one servers of the settings scopes use too. */
const environmentToken: TokenParser = (inner, { scope, policy }) => {
  const reference = splitDefault(inner);
  if (!EXPANDS[policy.environment] || !isVariableName(reference.name)) return undefined;
  return {
    reference: { kind: 'environment', name: reference.name },
    resolve: () => {
      const done = resolveEnvReference(
        reference,
        (name) => scope.environment.get(name),
        policy.readsAsEmpty,
      );
      return done.missing
        ? {
            text: done.text,
            problem: missingVariableMessage(reference.name),
            unresolved: { variable: reference.name },
          }
        : { text: done.text };
    },
  };
};

/** In order: the first parser that knows the reference decides. */
const TOKEN_PARSERS: readonly TokenParser[] = [
  userConfigToken,
  pathVariableToken,
  extraToken,
  environmentToken,
];

function parseToken(inner: string, context: Context): Token | undefined {
  for (const parser of TOKEN_PARSERS) {
    const token = parser(inner, context);
    if (token) return token;
  }
  return undefined;
}

export type Answers = ReadonlyMap<PluginVariable, string>;

/** Every distinct reference of the template, parsed once. */
function tokensOf(template: string, context: Context): Map<string, Token> {
  const tokens = new Map<string, Token>();
  for (const [raw, inner] of template.matchAll(BRACED_REFERENCE)) {
    const token = tokens.has(raw) ? undefined : parseToken(inner ?? '', context);
    if (token) tokens.set(raw, token);
  }
  return tokens;
}

const uniqueOf = (values: readonly (string | undefined)[]): string[] => [
  ...new Set(values.flatMap((value) => value ?? [])),
];

/** The substitution once the variables the template needs are known: no port is asked here. */
export function runWith(
  template: string,
  policy: FieldPolicy,
  path: string,
  base: { scope: SubstitutionScope; answers: Answers },
): Substituted {
  const context: Context = {
    scope: base.scope,
    policy,
    variable: (name) => base.answers.get(name) ?? '',
  };
  const tokens = tokensOf(template, context);
  const resolved = new Map([...tokens].map(([raw, token]) => [raw, token.resolve()] as const));
  const references = new Map<string, TokenReference>();
  for (const { reference } of tokens.values()) {
    references.set(JSON.stringify(reference), reference);
  }
  const all = [...resolved.values()];
  return {
    text: template.replace(BRACED_REFERENCE, (raw) => resolved.get(raw)?.text ?? raw),
    issues: all.flatMap(({ problem }) => (problem === undefined ? [] : [warning(path, problem)])),
    referenced: [...references.values()],
    unresolved: {
      variables: uniqueOf(all.map((one) => one.unresolved?.variable)),
      options: uniqueOf(all.map((one) => one.unresolved?.option)),
    },
  };
}

/** Which reference kinds name an environment variable of the host. */
const FROM_ENVIRONMENT: { readonly [K in TokenReference['kind']]: boolean } = {
  'path-variable': false,
  'user-config': false,
  environment: true,
  extra: false,
};

/** The environment variables among `referenced`, each once, in order. */
export const environmentNames = (referenced: readonly TokenReference[]): string[] => [
  ...new Set(
    referenced.flatMap((one) => (FROM_ENVIRONMENT[one.kind] && 'name' in one ? [one.name] : [])),
  ),
];

/** The path variables whose value the template writes, under the policy's rendering. */
export function neededVariables(
  template: string,
  scope: SubstitutionScope,
  policy: FieldPolicy,
): PluginVariable[] {
  if (!renderingNeedsValue(policy.paths)) return [];
  const probe: Context = { scope, policy, variable: () => '' };
  return [...tokensOf(template, probe).values()].flatMap(({ variable }) => variable ?? []);
}
