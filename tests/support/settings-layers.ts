/** Helpers for the settings tests: a layer from the JSON of one source, read the way a host would. */
import type { PluginIssue } from '../../src/format/index.ts';
import {
  readSettingsLayer,
  type PolicyScope,
  type SettingsLayer,
} from '../../src/settings/index.ts';

/** The layer `readSettingsLayer` makes of `raw`. */
export const layerOf = (scope: PolicyScope, raw: unknown): SettingsLayer =>
  readSettingsLayer(scope, raw).layer;

/** What `readSettingsLayer` said about `raw`. */
export const issuesOf = (scope: PolicyScope, raw: unknown): readonly PluginIssue[] =>
  readSettingsLayer(scope, raw).issues;

/** Widens a value to `unknown` so a test compares it with a plain literal. */
export const plain = (value: unknown): unknown => value;

/** A `command` hook handler. */
export const commandHook = (command: string) => ({ type: 'command', command });

/** `{ hooks: { PreToolUse: [ { matcher, hooks: [ command ] } ] } }` for one command. */
export const preToolUse = (matcher: string | undefined, command: string) => ({
  hooks: {
    PreToolUse: [
      matcher === undefined
        ? { hooks: [commandHook(command)] }
        : { matcher, hooks: [commandHook(command)] },
    ],
  },
});
