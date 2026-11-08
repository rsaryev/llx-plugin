import { error, type PluginIssue } from '../../format/issues.ts';
import type { UserConfigOption } from '../../format/index.ts';
import { userConfigValue, type ResolvedUserConfig, type UserConfigValue } from './user-config.ts';

/**
 * The checks of a saved `userConfig` value that the manifest's fields state (plugins/
 * manifest-reference.md, "User configuration"): `type` ("One of `string`, `number`, `boolean`,
 * `directory`, or `file`"), `required` ("the configuration dialog doesn't accept an empty value"),
 * `multiple` ("allows an array of strings"), `options` ("the values the field accepts") and `min` /
 * `max` ("Bounds for `number`"). The dialog is the host's; this tells it, and a loader that reads
 * saved settings, whether a value would be accepted. Judgment: the value checked is the one
 * `${user_config.KEY}` stands for, the saved one else the `default`, and a value that is not
 * declared is not checked (spec/judgments.md).
 */

const isEmpty = (value: UserConfigValue | undefined): boolean =>
  value === undefined || value === '' || (Array.isArray(value) && value.length === 0);

const TEXT_TYPES: readonly UserConfigOption['type'][] = ['string', 'directory', 'file'];

function typeProblem(option: UserConfigOption, value: UserConfigValue): string | undefined {
  if (TEXT_TYPES.includes(option.type)) {
    if (option.multiple === true) {
      const list = Array.isArray(value) && value.every((each) => typeof each === 'string');
      return list ? undefined : `expects an array of strings (multiple), not ${typeof value}`;
    }
    return typeof value === 'string' ? undefined : `expects a ${option.type}, not ${typeof value}`;
  }
  const want = option.type;
  return typeof value === want && (want !== 'number' || Number.isFinite(value))
    ? undefined
    : `expects a ${want}, not ${Array.isArray(value) ? 'array' : typeof value}`;
}

function limitProblem(option: UserConfigOption, value: UserConfigValue): string | undefined {
  if (typeof value === 'number') {
    if (option.min !== undefined && value < option.min) return `is below the minimum ${option.min}`;
    if (option.max !== undefined && value > option.max) return `is above the maximum ${option.max}`;
  }
  if (typeof value === 'string' && option.options && !option.options.includes(value)) {
    return `is not one of the options: ${option.options.join(', ')}`;
  }
  return undefined;
}

function problemOf(
  option: UserConfigOption,
  value: UserConfigValue | undefined,
): string | undefined {
  if (isEmpty(value))
    return option.required === true ? 'is required and cannot be empty' : undefined;
  return value === undefined
    ? undefined
    : (typeProblem(option, value) ?? limitProblem(option, value));
}

/** One error per declared option whose value would not be accepted: `userConfig.<key>`. */
export function validateUserConfigValues(config: ResolvedUserConfig): PluginIssue[] {
  return Object.entries(config.declared).flatMap(([key, option]) => {
    const problem = problemOf(option, userConfigValue(config, key));
    return problem === undefined
      ? []
      : [error(`userConfig.${key}`, `"${option.title}" ${problem}`)];
  });
}
