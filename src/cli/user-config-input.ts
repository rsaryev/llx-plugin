import type { UserConfigOption } from '../format/index.ts';
import {
  userConfigValue,
  type ResolvedUserConfig,
  type UserConfigValue,
} from '../loading/resolve/user-config.ts';
import { validateUserConfigValues } from '../loading/resolve/user-config-values.ts';

/**
 * `userConfig` values that arrive as text from a shell (plugins/cli-reference.md, "plugin install",
 * `--config <key=value>`; "plugin configure", `--values-stdin`: "a JSON object of single-line
 * strings"): each is converted to the option's declared type and checked against it
 * (`validateUserConfigValues`: "Claude Code validates each value against the option's declared
 * type"). Pure. How a text becomes a number, a boolean or a list is a judgment (spec/judgments.md):
 * the docs show strings only.
 */

export type DeclaredOptions = Readonly<Record<string, UserConfigOption>>;

export interface ConfigProblem {
  readonly key: string;
  readonly message: string;
  /** The key is not among the declared options. */
  readonly undeclared: boolean;
}

export interface CheckedInput {
  /** The values that passed, converted to their declared types. */
  readonly accepted: Readonly<Record<string, UserConfigValue>>;
  readonly problems: readonly ConfigProblem[];
}

type Converter = (option: UserConfigOption, text: string) => UserConfigValue;

const asText: Converter = (option, text) =>
  option.multiple === true
    ? text.trim() === ''
      ? []
      : text.split(',').map((item) => item.trim())
    : text;

const asNumber: Converter = (_option, text) =>
  text.trim() !== '' && Number.isFinite(Number(text)) ? Number(text) : text;

const asBoolean: Converter = (_option, text) => {
  if (text === 'true') return true;
  return text === 'false' ? false : text;
};

/** Per declared type, how a text becomes a value; a text that does not fit stays text and fails the check. */
const CONVERTERS: { readonly [T in UserConfigOption['type']]: Converter } = {
  string: asText,
  directory: asText,
  file: asText,
  number: asNumber,
  boolean: asBoolean,
};

/** A text as the option's type: numbers and booleans are parsed, a `multiple` list splits on commas. */
export const convertText = (option: UserConfigOption, text: string): UserConfigValue =>
  CONVERTERS[option.type](option, text);

const undeclaredProblem = (key: string, declared: DeclaredOptions): ConfigProblem => {
  const known = Object.keys(declared);
  const list = known.length === 0 ? 'none' : known.join(', ');
  return {
    key,
    undeclared: true,
    message: `"${key}" isn't declared in this plugin's userConfig (it declares: ${list})`,
  };
};

function checkOne(
  key: string,
  text: string,
  declared: DeclaredOptions,
): { readonly value: UserConfigValue } | ConfigProblem {
  const option = Object.hasOwn(declared, key) ? declared[key] : undefined;
  if (option === undefined) return undeclaredProblem(key, declared);
  const value = convertText(option, text);
  const config: ResolvedUserConfig = { declared: { [key]: option }, values: { [key]: value } };
  const [issue] = validateUserConfigValues(config);
  return issue === undefined ? { value } : { key, undeclared: false, message: issue.message };
}

/** Each given `key` → text against the declared options; undeclared keys and failing values are problems. */
export function checkGiven(
  declared: DeclaredOptions,
  given: Readonly<Record<string, string>>,
): CheckedInput {
  const accepted: Record<string, UserConfigValue> = {};
  const problems: ConfigProblem[] = [];
  for (const [key, text] of Object.entries(given)) {
    const checked = checkOne(key, text, declared);
    if ('value' in checked) accepted[key] = checked.value;
    else problems.push(checked);
  }
  return { accepted, problems };
}

/**
 * The options with no value: neither saved nor a declared `default` (judgment: "set" is the value
 * `${user_config.KEY}` stands for, as `userConfigValue` reads it).
 */
export const unsetKeys = (config: ResolvedUserConfig): readonly string[] =>
  Object.keys(config.declared).filter((key) => userConfigValue(config, key) === undefined);

/** The saved values merged with `accepted`: what a config reads once the values are stored. */
export const withValues = (
  config: ResolvedUserConfig,
  accepted: Readonly<Record<string, UserConfigValue>>,
): ResolvedUserConfig => ({ declared: config.declared, values: { ...config.values, ...accepted } });
