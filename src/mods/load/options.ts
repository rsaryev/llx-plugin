import { error, type PluginIssue } from '../../format/issues.ts';
import type { UserConfigOption } from '../../format/index.ts';
import type { JsonObject, JsonValue } from '../../foundation/index.ts';
import { userConfigValue, type UserConfigValue } from '../../loading/resolve/index.ts';

/**
 * The `options` a hooks module's `register(on, options)` receives: "the values of the `userConfig`
 * fields the manifest declares, with defaults filled in" (plugins/mods/reference.md, "Files"). A value
 * that does not fit its field is `options do not fit plugin.json userConfig: <reason>`, ending with
 * the entry of `pluginConfigs` that holds it (troubleshoot.md).
 */

export const OPTIONS_DO_NOT_FIT = 'options do not fit plugin.json userConfig';

/** Why `value` does not fit `option`, or `undefined`. A registry over the declared types. */
const CHECKS: {
  readonly [T in UserConfigOption['type']]: (
    value: UserConfigValue,
    option: UserConfigOption,
  ) => string | undefined;
} = {
  string: (value, option) => {
    const items = Array.isArray(value) ? value : [value];
    if (Array.isArray(value) && option.multiple !== true) return 'must be one string, not a list';
    const texts = items.filter((item) => typeof item === 'string');
    if (texts.length !== items.length) return 'must be a string';
    const choices = option.options;
    const stray = choices ? texts.find((text) => !choices.includes(text)) : undefined;
    return stray === undefined
      ? undefined
      : `${JSON.stringify(stray)} is not one of ${choices?.join(', ')}`;
  },
  number: (value, option) => {
    if (typeof value !== 'number') return 'must be a number';
    if (option.max !== undefined && value > option.max)
      return `${value} is above the maximum ${option.max}`;
    return option.min !== undefined && value < option.min
      ? `${value} is below the minimum ${option.min}`
      : undefined;
  },
  boolean: (value) => (typeof value === 'boolean' ? undefined : 'must be true or false'),
  directory: (value) => (typeof value === 'string' ? undefined : 'must be a path'),
  file: (value) => (typeof value === 'string' ? undefined : 'must be a path'),
};

export interface ModOptions {
  readonly options: JsonObject;
  readonly issues: readonly PluginIssue[];
}

const isSavedValue = (value: unknown): value is UserConfigValue =>
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean' ||
  (Array.isArray(value) && value.every((item) => typeof item === 'string'));

/** The saved values that are a value an option can hold; each is then checked against its own field. */
function savedValues(saved: JsonObject | undefined): Record<string, UserConfigValue> {
  const values: Record<string, UserConfigValue> = {};
  for (const [key, value] of Object.entries(saved ?? {})) {
    if (isSavedValue(value)) values[key] = value;
  }
  return values;
}

/**
 * The options of one mod: each declared field's saved value, else its default; a field with
 * neither and not `required` is left out (judgment: the docs say "defaults filled in" and nothing
 * for a field with none). `saved` is `pluginConfigs[id].options`.
 */
export function modOptions(
  id: string,
  declared: Readonly<Record<string, UserConfigOption>>,
  saved: JsonObject | undefined,
): ModOptions {
  const values = savedValues(saved);
  const options: Record<string, JsonValue> = {};
  const reasons: string[] = [];
  for (const [key, option] of Object.entries(declared)) {
    const value = userConfigValue({ declared, values }, key);
    if (value === undefined) {
      if (option.required === true) reasons.push(`${key} is required and has no value`);
      continue;
    }
    const problem = CHECKS[option.type](value, option);
    if (problem) reasons.push(`${key} ${problem}`);
    else options[key] = value;
  }
  if (reasons.length === 0) return { options, issues: [] };
  const where = `pluginConfigs["${id}"].options in settings.json`;
  return {
    options: {},
    issues: [error('userConfig', `${OPTIONS_DO_NOT_FIT}: ${reasons.join('; ')} (${where})`)],
  };
}
