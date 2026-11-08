import type { PluginNode } from '../../src/marketplace/install-dependency-graph.ts';
import type { ChosenScope } from '../../src/marketplace/install-scopes.ts';

/**
 * Graph nodes for the dependency plan tests: `node` is a plugin installed and on at one scope
 * (`installed: false` or `enabled: false` change that), `app` a plugin that depends on `lib@acme`.
 */
export interface NodeFacts extends Partial<PluginNode> {
  /** Installed at `scope` (default `true`). */
  readonly installed?: boolean;
  /** On at `scope` (default `true`); an installed plugin that is off has `false` written there. */
  readonly enabled?: boolean;
  /** The scope the plugin is installed and listed at (default `user`). */
  readonly scope?: ChosenScope;
}

export const node = (id: string, facts: NodeFacts = {}): PluginNode => {
  const { installed = true, enabled = true, scope = 'user', ...rest } = facts;
  return {
    id,
    installedScopes: installed ? [scope] : [],
    enabledIn: installed ? { [scope]: enabled } : {},
    dependencies: [],
    ...rest,
  };
};

export const app = (facts: NodeFacts = {}) =>
  node('app@acme', { dependencies: ['lib@acme'], ...facts });
