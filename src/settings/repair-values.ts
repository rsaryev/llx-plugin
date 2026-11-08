import { warning, type PluginIssue } from '../format/issues.ts';
import { SKILL_OVERRIDE_STATES, WORKFLOW_SIZES } from '../protocol/settings-keys.ts';
import {
  dropped,
  entryDropped,
  failedClosed,
  isParent,
  kept,
  where,
  type Repair,
} from './repair-support.ts';
import { isRecord } from './record.ts';

/** A Boolean: anything else is dropped with a warning, even the text `"true"` (the docs' `disableAllHooks` case). */
export const boolean: Repair = (value, at) =>
  typeof value === 'boolean' ? kept(value) : dropped(at, `"${at.key}" must be true or false`);

/**
 * A Boolean lock (`allowManagedHooksOnly`, `disableSkillShellExecution`...). In the policy tier the
 * text `"true"` or `"false"` reads as that Boolean with a notice to drop the quotes, and any other
 * unreadable value reads as `true`, the restrictive one (managed-settings.md, "Keys that fail
 * closed"). Elsewhere an unreadable value is dropped.
 */
export const lockBoolean: Repair = (value, at) => {
  if (typeof value === 'boolean') return kept(value);
  if (!at.closed) return dropped(at, `"${at.key}" must be true or false`);
  if (value === 'true' || value === 'false') {
    return kept(value === 'true', [
      warning(where(at), `"${at.key}" is the text "${value}": drop the quotes`),
    ]);
  }
  return failedClosed(at, true, 'true');
};

/**
 * `disableAllHooks`. In the SDK's `managedSettings` "any value but `false` and `"false"` binds" as
 * `allowManagedHooksOnly: true`, "because an enterprise configuration often yields a boolean as
 * text", so there an unreadable value reads as `true`, with a warning. Every other source reads a
 * Boolean and drops anything else.
 */
export const hooksSwitch: Repair = (value, at) => {
  if (typeof value === 'boolean' || !isParent(at)) return boolean(value, at);
  if (value === 'false') {
    return kept(false, [warning(where(at), `"${at.key}" is the text "false": drop the quotes`)]);
  }
  return failedClosed(at, true, 'true: it binds as "allowManagedHooksOnly": true');
};

export const string: Repair = (value, at) =>
  typeof value === 'string' ? kept(value) : dropped(at, `"${at.key}" must be a text`);

/** An object whose entries the kit reads later, per plugin or per server. */
export const record: Repair = (value, at) =>
  isRecord(value) ? kept(value) : dropped(at, `"${at.key}" must be an object`);

/**
 * `strictPluginOnlyCustomization` is `true` or a list of surfaces. Unreadable in the policy tier it
 * reads as `true`, locking all four; an entry of a list that this version does not know locks
 * nothing, and the customization policy counts it (managed-settings.md), so a list keeps its
 * entries as written.
 */
export const pluginOnly: Repair = (value, at) => {
  if (typeof value === 'boolean' || Array.isArray(value)) return kept(value);
  return at.closed
    ? failedClosed(at, true, 'true: all four kinds of customization are locked')
    : dropped(at, `"${at.key}" must be true or a list of surfaces`);
};

/** `plugin-name@marketplace-name` (settings-reference.md, `enabledPlugins`). */
const PLUGIN_ID = /^[^@\s]+@[^@\s]+$/;

/**
 * `enabledPlugins`: an invalid entry is dropped with a warning and the others stay; a value that is
 * no map of plugin ids, or whose every entry is invalid, is dropped whole (managed-settings.md).
 * The SDK also types a list or an object as the value (version constraints), kept as written.
 */
export const enabledPlugins: Repair = (value, at) => {
  if (!isRecord(value)) return dropped(at, `"${at.key}" must map plugin ids to true or false`);
  const entries = Object.entries(value);
  const issues: PluginIssue[] = [];
  const valid: [string, unknown][] = [];
  for (const [id, entry] of entries) {
    const readable =
      PLUGIN_ID.test(id) && (typeof entry === 'boolean' || Array.isArray(entry) || isRecord(entry));
    if (readable) valid.push([id, entry]);
    else issues.push(entryDropped(at, id, `"${id}" is not a plugin id mapped to true or false`));
  }
  if (entries.length > 0 && valid.length === 0) {
    return {
      value: undefined,
      issues: [...issues, ...dropped(at, 'Every entry is invalid').issues],
    };
  }
  return kept(Object.fromEntries(valid), issues);
};

/** `extraKnownMarketplaces`: a name maps to an object with a `source` object; others are dropped. */
export const marketplaceMap: Repair = (value, at) => {
  if (!isRecord(value)) return dropped(at, `"${at.key}" must map marketplace names to entries`);
  const issues: PluginIssue[] = [];
  const valid: [string, unknown][] = [];
  for (const [name, entry] of Object.entries(value)) {
    if (isRecord(entry) && isRecord(entry.source)) valid.push([name, entry]);
    else issues.push(entryDropped(at, name, `"${name}" has no "source" object`));
  }
  return kept(Object.fromEntries(valid), issues);
};

const isSkillState = (state: unknown): boolean => SKILL_OVERRIDE_STATES.some((s) => s === state);

/** `skillOverrides`: a skill name maps to one of the four states; any other entry is dropped. */
export const skillOverrides: Repair = (value, at) => {
  if (!isRecord(value)) return dropped(at, `"${at.key}" must map skill names to states`);
  const issues: PluginIssue[] = [];
  const valid: [string, unknown][] = [];
  for (const [name, state] of Object.entries(value)) {
    if (isSkillState(state)) valid.push([name, state]);
    else
      issues.push(
        entryDropped(at, name, `"${name}" is not one of ${SKILL_OVERRIDE_STATES.join(', ')}`),
      );
  }
  return kept(Object.fromEntries(valid), issues);
};

export const workflowSize: Repair = (value, at) =>
  WORKFLOW_SIZES.some((size) => size === value)
    ? kept(value)
    : dropped(at, `"${at.key}" must be one of ${WORKFLOW_SIZES.join(', ')}`);
