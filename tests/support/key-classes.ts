/** Helpers of the key-class tests: layers read the way a host reads them, and the view over them. */
import { createGeneralView } from '../../src/settings/general/index.ts';
import { readSettingsLayer, type PolicyScope } from '../../src/settings/index.ts';
import type { PluginIssue } from '../../src/format/issues.ts';

export type Source = readonly [PolicyScope, unknown];

/** The general view over the sources, each read as `readSettingsLayer` does. */
export const viewOf = (...sources: readonly Source[]) =>
  createGeneralView(sources.map(([scope, raw]) => readSettingsLayer(scope, raw).layer));

/** What reading one source's JSON said. */
const saidAbout = (scope: PolicyScope, raw: unknown): readonly PluginIssue[] =>
  readSettingsLayer(scope, raw).issues;

/** The messages of what reading one source said. */
export const messagesOf = (scope: PolicyScope, raw: unknown): readonly string[] =>
  saidAbout(scope, raw).map((issue) => issue.message);

/** `{ a: { b: value } }` for the dotted path `a.b`. */
export const nest = (path: string, value: unknown): Record<string, unknown> =>
  path
    .split('.')
    .toReversed()
    .reduce<unknown>((inner, name) => ({ [name]: inner }), value) as Record<string, unknown>;
