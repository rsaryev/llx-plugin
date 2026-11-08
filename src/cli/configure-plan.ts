import type { JsonValue } from '../foundation/plain-data.ts';
import { toJsonValue } from '../foundation/json-value.ts';
import {
  userConfigValue,
  type ResolvedUserConfig,
  type UserConfigValue,
} from '../loading/resolve/user-config.ts';
import { commandFailed, commandSucceeded, type CommandOutput } from './result.ts';
import { checkGiven, unsetKeys, withValues, type ConfigProblem } from './user-config-input.ts';

/**
 * `claude plugin configure <plugin>` as a plan (plugins/cli-reference.md, "plugin configure"): the
 * plugin's `userConfig` options and which are set, or the values piped in on stdin validated and
 * saved. Only the full `name@marketplace` id is accepted ("`configure` doesn't accept a bare
 * `name`"). A saved value is never printed except, with `--json`, a value of an option that isn't
 * sensitive ("never the text of a sensitive one"). Pure over the loaded plugins; the host reads
 * stdin and stores what the plan names: "Non-sensitive values are saved under `pluginConfigs` ...
 * Sensitive values go to the platform's secure credential store" (manifest-reference.md, "Where
 * values are stored"). What the docs leave open is in spec/judgments.md.
 */

export interface ConfigureArguments {
  /** The plugin's full `name@marketplace` id. */
  readonly plugin: string;
  /** The text read from stdin; present exactly when `--values-stdin` is passed. */
  readonly valuesStdin?: string;
  readonly json?: boolean;
}

/** A plugin that loaded, with its declared options and what is saved for them. */
export interface ConfigurablePlugin {
  readonly id: string;
  readonly config: ResolvedUserConfig;
}

export interface ConfigureFacts {
  readonly loaded: readonly ConfigurablePlugin[];
}

/** What the host stores, split by where it goes. */
export interface SavedValues {
  /** `pluginConfigs` in the user's settings. */
  readonly settings: Readonly<Record<string, UserConfigValue>>;
  /** The platform's secure credential store. */
  readonly secrets: Readonly<Record<string, UserConfigValue>>;
}

export interface ConfigurePlan {
  readonly output: CommandOutput;
  /** Set when values are to be stored; a refused save sets nothing. */
  readonly save?: SavedValues;
}

export const SAVED_MESSAGE = 'Configuration saved. Restart Claude Code to apply it.';
export const SAVE_FAILED = 'Failed to save configuration:';

const nothing = (output: CommandOutput): ConfigurePlan => ({ output });

const notInstalled = (plugin: string): ConfigurePlan =>
  nothing(
    commandFailed('configure', `No installed plugin has the id "${plugin}".`, {
      failureCode: 'not_installed',
    }),
  );

/** `required` or `optional`, then `sensitive`, then `set` or `not set` ("up to three labels"). */
function labelsOf(config: ResolvedUserConfig, key: string): readonly string[] {
  const option = config.declared[key];
  return [
    option?.required === true ? 'required' : 'optional',
    ...(option?.sensitive === true ? ['sensitive'] : []),
    userConfigValue(config, key) === undefined ? 'not set' : 'set',
  ];
}

/** One line per option; never a saved value. */
function listing(plugin: ConfigurablePlugin): string {
  const keys = Object.keys(plugin.config.declared);
  if (keys.length === 0) return `${plugin.id} declares no userConfig options`;
  const lines = keys.map(
    (key) =>
      `${key} (${labelsOf(plugin.config, key).join(', ')}): ${plugin.config.declared[key]?.title ?? key}`,
  );
  return [`Options of ${plugin.id}:`, ...lines].join('\n');
}

/** The value an option starts a dialog with: saved, else the default; never a sensitive option's. */
function inputsOf(config: ResolvedUserConfig): Record<string, JsonValue> {
  const inputs: Record<string, JsonValue> = {};
  for (const [key, option] of Object.entries(config.declared)) {
    const value = userConfigValue(config, key);
    if (option.sensitive !== true && value !== undefined) inputs[key] = value;
  }
  return inputs;
}

const configuredOf = (config: ResolvedUserConfig): readonly string[] =>
  Object.keys(config.declared).filter((key) => !unsetKeys(config).includes(key));

function choicesOf(config: ResolvedUserConfig): Record<string, JsonValue> {
  const choices: Record<string, JsonValue> = {};
  for (const [key, option] of Object.entries(config.declared)) {
    if (option.options !== undefined) choices[key] = option.options;
  }
  return choices;
}

/** The object `--json` prints without `--values-stdin`. */
function describePlugin(plugin: ConfigurablePlugin): ConfigurePlan {
  const { config } = plugin;
  return nothing(
    commandSucceeded('configure', listing(plugin), {
      fields: {
        pluginId: plugin.id,
        schema: toJsonValue(config.declared) ?? {},
        choices: choicesOf(config),
        inputs: inputsOf(config),
        configured: [...configuredOf(config)],
        unconfigured: [...unsetKeys(config)],
      },
    }),
  );
}

/** The `--values-stdin` text as an object of single-line strings, or the problems with it. */
function readGiven(
  text: string,
): { readonly given: Record<string, string> } | { readonly problems: readonly ConfigProblem[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { problems: [whole('stdin is not valid JSON')] };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {
      problems: [whole('stdin must be a JSON object that maps option keys to string values')],
    };
  }
  const given: Record<string, string> = {};
  const problems: ConfigProblem[] = [];
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === 'string' && !/[\r\n]/.test(value)) given[key] = value;
    else
      problems.push({
        key,
        undeclared: false,
        message: `the value of "${key}" must be a single-line string`,
      });
  }
  return problems.length === 0 ? { given } : { problems };
}

/** A problem that is not one option's: it carries no option key. */
const whole = (message: string): ConfigProblem => ({ key: '', undeclared: false, message });

function refusal(problems: readonly ConfigProblem[]): ConfigurePlan {
  const message = problems.map((problem) => problem.message).join('; ');
  const [only] = problems;
  const option =
    problems.length === 1 && only !== undefined && only.key !== '' ? only.key : undefined;
  return nothing(
    commandFailed('configure', `${SAVE_FAILED} ${message}`, {
      failureCode: 'invalid_values',
      fields: { refused: { message, ...(option === undefined ? {} : { option }) } },
    }),
  );
}

function split(
  plugin: ConfigurablePlugin,
  accepted: Readonly<Record<string, UserConfigValue>>,
): SavedValues {
  const settings: Record<string, UserConfigValue> = {};
  const secrets: Record<string, UserConfigValue> = {};
  for (const [key, value] of Object.entries(accepted)) {
    const sensitive = plugin.config.declared[key]?.sensitive === true;
    (sensitive ? secrets : settings)[key] = value;
  }
  return { settings, secrets };
}

function saveValues(plugin: ConfigurablePlugin, text: string): ConfigurePlan {
  const read = readGiven(text);
  if ('problems' in read) return refusal(read.problems);
  const checked = checkGiven(plugin.config.declared, read.given);
  if (checked.problems.length > 0) return refusal(checked.problems);
  const after = withValues(plugin.config, checked.accepted);
  return {
    output: commandSucceeded('configure', SAVED_MESSAGE, {
      fields: {
        pluginId: plugin.id,
        saved: Object.keys(checked.accepted),
        unconfigured: [...unsetKeys(after)],
      },
    }),
    save: split(plugin, checked.accepted),
  };
}

/** What `claude plugin configure` prints and saves. */
export function planConfigure(args: ConfigureArguments, facts: ConfigureFacts): ConfigurePlan {
  const plugin = facts.loaded.find((one) => one.id === args.plugin);
  if (plugin === undefined) return notInstalled(args.plugin);
  return args.valuesStdin === undefined
    ? describePlugin(plugin)
    : saveValues(plugin, args.valuesStdin);
}
