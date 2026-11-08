import { warning, type PluginIssue } from '../../format/issues.ts';
import type {
  EnvironmentExpansion,
  FieldPolicy,
  SubstitutionScope,
  UserConfigPolicy,
} from './scope.ts';
import {
  userConfigKeyIn,
  userConfigText,
  userConfigValue,
  type UserConfigValue,
} from './user-config.ts';
import { isPluginVariable, pluginVariableValue, renderPluginVariable } from './variables.ts';
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
}

/** The text a reference becomes, or why it stayed as written (`problem`). */
interface Resolution {
  readonly text: string;
  readonly problem?: string;
}

interface Token {
  readonly reference: TokenReference;
  resolve(): Promise<Resolution>;
}

interface Context {
  readonly scope: SubstitutionScope;
  readonly policy: FieldPolicy;
  /** The variable as the host reports it, asked once per substituter. */
  variable(name: PluginVariable): Promise<string>;
}

type TokenParser = (inner: string, context: Context) => Token | undefined;

const BRACED = /\$\{([^{}]*)\}/g;
const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** `NAME` or `NAME:-default`. */
function splitDefault(inner: string): { name: string; fallback: string | undefined } {
  const at = inner.indexOf(':-');
  return at < 0
    ? { name: inner, fallback: undefined }
    : { name: inner.slice(0, at), fallback: inner.slice(at + 2) };
}

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
  const key = userConfigKeyIn(inner);
  if (key === undefined) return undefined;
  const raw = `\${${inner}}`;
  const declared = scope.userConfig.declared[key];
  const disposition = DISPOSITIONS[policy.userConfig](declared?.sensitive === true);
  return {
    reference: { kind: 'user-config', key },
    resolve: () => {
      // A sensitive option is never shown, so whether it has a value does not matter (oracle).
      if (disposition === 'placeholder')
        return Promise.resolve({ text: SENSITIVE_PLACEHOLDER(key) });
      const value = userConfigValue(scope.userConfig, key);
      if (value === undefined && disposition !== 'keep') {
        const why = declared === undefined ? 'is not declared in userConfig' : 'has no value';
        return Promise.resolve({ text: raw, problem: `\${user_config.${key}} ${why}` });
      }
      const text = value === undefined ? raw : RENDERINGS[disposition](raw, key, value);
      return Promise.resolve({ text });
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
    resolve: async () => ({
      text: await renderPluginVariable(
        policy.paths,
        name,
        () => context.variable(name),
        scope.windows,
      ),
    }),
  };
};

const extraToken: TokenParser = (inner, { scope }) => {
  const { name } = splitDefault(inner);
  const extra = scope.extra;
  const value = extra !== undefined && Object.hasOwn(extra, name) ? extra[name] : undefined;
  return value === undefined
    ? undefined
    : { reference: { kind: 'extra', name }, resolve: () => Promise.resolve({ text: value }) };
};

const EXPANDS: { readonly [E in EnvironmentExpansion]: boolean } = {
  expand: true,
  literal: false,
};

const environmentToken: TokenParser = (inner, { scope, policy }) => {
  const { name, fallback } = splitDefault(inner);
  if (!EXPANDS[policy.environment] || !NAME.test(name)) return undefined;
  return {
    reference: { kind: 'environment', name },
    resolve: () => {
      if (policy.readsAsEmpty?.(name) === true) return Promise.resolve({ text: '' });
      const value = scope.environment.get(name) ?? fallback;
      const unset = `Environment variable ${name} is not set and has no default`;
      return Promise.resolve(
        value === undefined ? { text: `\${${inner}}`, problem: unset } : { text: value },
      );
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

export interface Substituter {
  /** `path` names the field in the issues. */
  run(template: string, policy: FieldPolicy, path?: string): Promise<Substituted>;
}

/**
 * A substituter keeps what the host answered for the variables, so several strings of one
 * component (a server's `command`, `args` and `env`) ask for the data folder once.
 */
export function substituter(scope: SubstitutionScope): Substituter {
  const answers = new Map<PluginVariable, Promise<string>>();
  const variable = (name: PluginVariable): Promise<string> => {
    const known = answers.get(name) ?? pluginVariableValue(name, scope);
    answers.set(name, known);
    return known;
  };
  return {
    async run(template, policy, path = '') {
      const context: Context = { scope, policy, variable };
      const tokens = new Map<string, Token>();
      for (const [raw, inner] of template.matchAll(BRACED)) {
        const token = tokens.has(raw) ? undefined : parseToken(inner ?? '', context);
        if (token) tokens.set(raw, token);
      }
      const resolved = new Map<string, Resolution>(
        await Promise.all(
          [...tokens].map(async ([raw, token]) => [raw, await token.resolve()] as const),
        ),
      );
      const references = new Map<string, TokenReference>();
      for (const { reference } of tokens.values()) {
        references.set(JSON.stringify(reference), reference);
      }
      return {
        text: template.replace(BRACED, (raw) => resolved.get(raw)?.text ?? raw),
        issues: [...resolved.values()].flatMap(({ problem }) =>
          problem === undefined ? [] : [warning(path, problem)],
        ),
        referenced: [...references.values()],
      };
    },
  };
}

export const substituteTemplate = (
  template: string,
  scope: SubstitutionScope,
  policy: FieldPolicy,
  path = '',
): Promise<Substituted> => substituter(scope).run(template, policy, path);
