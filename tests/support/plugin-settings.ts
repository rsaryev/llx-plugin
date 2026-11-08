/** Helpers for the plugin-key tests: a policy view over layers read the way a host would read them. */
import { createPolicyView, type PolicyScope, type PolicyView } from '../../src/settings/index.ts';
import { layerOf } from './settings-layers.ts';

/** One source of settings: its scope and the JSON it holds. */
export type Source = readonly [PolicyScope, unknown];

/** The view over the layers `readSettingsLayer` makes of each source, in the order given. */
export const viewOf = (...sources: readonly Source[]): PolicyView =>
  createPolicyView(sources.map(([scope, raw]) => layerOf(scope, raw)));
