import type { PluginIssue } from '../../format/issues.ts';
import type { FieldPolicy, SubstitutionScope } from './scope.ts';
import { substituter, type Substituter, type TokenReference } from './substitute.ts';

export type ValuePath = readonly (string | number)[];

export interface DeepSubstituted {
  /** The input with every string substituted; callers narrow it (a schema parse), the walk keeps no type. */
  readonly value: unknown;
  readonly issues: readonly PluginIssue[];
  readonly referenced: readonly TokenReference[];
}

interface Walk {
  readonly substitute: Substituter;
  readonly policyFor: (path: ValuePath) => FieldPolicy;
  readonly base: string;
  readonly issues: PluginIssue[];
  readonly referenced: TokenReference[];
}

const nameOf = (base: string, path: ValuePath): string =>
  [base, ...path].filter((part) => part !== '').join('.');

async function walk(value: unknown, path: ValuePath, state: Walk): Promise<unknown> {
  if (typeof value === 'string') {
    const done = await state.substitute.run(value, state.policyFor(path), nameOf(state.base, path));
    state.issues.push(...done.issues);
    state.referenced.push(...done.referenced);
    return done.text;
  }
  if (Array.isArray(value)) {
    return Promise.all(value.map((item, index) => walk(item, [...path, index], state)));
  }
  if (typeof value === 'object' && value !== null) {
    const entries = await Promise.all(
      Object.entries(value).map(
        async ([key, item]) => [key, await walk(item, [...path, key], state)] as const,
      ),
    );
    return Object.fromEntries(entries);
  }
  return value;
}

/**
 * Substitutes every string of a JSON value (an MCP server's `args` and `env`, an LSP server), each
 * with the policy of its path; numbers, booleans and `null` stay. The host is asked once per
 * variable for the whole value. Issues name the field (`env.TOKEN`, `args.1`), under `base` when
 * given.
 */
export async function substituteDeep(
  value: unknown,
  scope: SubstitutionScope,
  policyFor: (path: ValuePath) => FieldPolicy,
  base = '',
): Promise<DeepSubstituted> {
  const state: Walk = {
    substitute: substituter(scope),
    policyFor,
    base,
    issues: [],
    referenced: [],
  };
  const done = await walk(value, [], state);
  return { value: done, issues: state.issues, referenced: state.referenced };
}
