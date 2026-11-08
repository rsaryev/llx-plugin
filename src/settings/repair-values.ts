import { readHooksSettings } from '../format/hooks-settings.ts';
import { blocksLoading, warning, type PluginIssue } from '../format/issues.ts';
import { SKILL_OVERRIDE_STATES, WORKFLOW_SIZES } from '../protocol/settings-keys.ts';
import {
  dropped,
  entryDropped,
  failedClosed,
  isRecord,
  kept,
  where,
  type Repair,
} from './repair-support.ts';

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

/**
 * `hooks`: read with the hooks reader, so a settings file and a plugin's `hooks.json` agree on
 * what loads. An error leaves the key out ("the source's `hooks` field is ignored", errors.md,
 * "Managed settings contain invalid entries"), a warning keeps the hooks. Each issue names the scope.
 */
export const hooks: Repair = (value, at) => {
  const read = readHooksSettings(value);
  const issues = read.issues.map((issue) => ({ ...issue, path: `${at.scope}:${issue.path}` }));
  return blocksLoading(read.issues) ? { value: undefined, issues } : kept(read.hooks, issues);
};
