/**
 * The ways to change one setting for one session without saving it (settings.md, "Change a setting
 * for one session"): a flag for that key and an environment variable paired with it. Environment
 * variables "aren't a level in this stack": which one applies is decided per pair (env-vars.md,
 * "Precedence"; model-config.md, "Setting your model"; settings-reference.md, `effortLevel`).
 */
export interface SessionInput {
  /** The command-line flags, by name (`--model`), with the value given. */
  readonly flags: Readonly<Record<string, string | undefined>>;
  /** The host's environment. */
  readonly env: Readonly<Record<string, string | undefined>>;
  /** The key's value as the settings files combine it. */
  readonly settingsValue: string | undefined;
  /**
   * The `availableModels` list as the files combine it (`undefined` when none sets it). A flag such
   * as `--model` "picks only from the models your organization allows" (settings.md, "Settings
   * precedence"); `[]` blocks every named selection (model-config.md, "Default model behavior").
   */
  readonly availableModels?: readonly string[] | undefined;
}

/** One place a key's value can come from, as a reader of the session input. */
export interface OverrideSource {
  readonly name: string;
  readonly read: (input: SessionInput) => string | undefined;
  /** A value the source reads counts only when this says so; absent, any value counts. */
  readonly admit?: (value: string, input: SessionInput) => boolean;
}

const flag = (name: string, admit?: OverrideSource['admit']): OverrideSource => ({
  name,
  read: (input) => input.flags[name],
  ...(admit === undefined ? {} : { admit }),
});
const variable = (name: string): OverrideSource => ({ name, read: (input) => input.env[name] });
const files = (admit?: OverrideSource['admit']): OverrideSource => ({
  name: 'settings files',
  read: (input) => input.settingsValue,
  ...(admit === undefined ? {} : { admit }),
});

/**
 * Whether `availableModels` lets a model be selected. The SDK types the entries: "family aliases
 * (`opus` allows any opus version), version prefixes (`opus-4-5` allows that version and any model
 * ID that extends it, so `claude-opus-5` also allows `claude-opus-5-5`), and full model IDs". The
 * kit reads that as: the entry is the whole name, a prefix of it, or starts one of its dash-separated
 * parts (spec/judgments.md).
 */
const modelAllowed: NonNullable<OverrideSource['admit']> = (value, { availableModels }) => {
  if (availableModels === undefined) return true;
  const model = value.trim().toLowerCase();
  return availableModels.some((entry) => {
    const allowed = entry.trim().toLowerCase();
    return allowed !== '' && (model.startsWith(allowed) || model.includes(`-${allowed}`));
  });
};

/** `--effort` for the level, with `CLAUDE_CODE_EFFORT_LEVEL` over both and the files under. */
const EFFORT = [variable('CLAUDE_CODE_EFFORT_LEVEL'), flag('--effort'), files()] as const;

/** The keys with a per-session override, each with its sources highest first. */
export const SESSION_OVERRIDES = {
  // `--model` overrides `ANTHROPIC_MODEL`, which overrides the `model` key; `ANTHROPIC_DEFAULT_MODEL`
  // "applies only when no file sets `model`".
  // A flag and a file value are gated by `availableModels`; the variable is not named there.
  model: [
    flag('--model', modelAllowed),
    variable('ANTHROPIC_MODEL'),
    files(modelAllowed),
    variable('ANTHROPIC_DEFAULT_MODEL'),
  ],
  // "`--effort` takes precedence over this key for one session, and `CLAUDE_CODE_EFFORT_LEVEL` takes precedence over both".
  effortLevel: EFFORT,
  // "`--effort` for `effortLevel` and `modelSettings`": the settings value is the level saved for the model.
  modelSettings: EFFORT,
  // permission-modes.md, "Which mode a session starts in": "The `--permission-mode` flag" comes first, then `permissions.defaultMode`.
  'permissions.defaultMode': [flag('--permission-mode'), files()],
  // "Claude Code reads the variable first and uses the `autoConnectIde` setting only when the variable is unset."
  autoConnectIde: [variable('CLAUDE_CODE_AUTO_CONNECT_IDE'), files()],
} as const satisfies Readonly<Record<string, readonly OverrideSource[]>>;

export type OverriddenKey = keyof typeof SESSION_OVERRIDES;

export interface SessionValue {
  readonly value: string;
  /** Which source supplied it. */
  readonly from: string;
}

/** The value a session uses: the first source that has one. */
export function resolveSessionValue(
  key: OverriddenKey,
  input: SessionInput,
): SessionValue | undefined {
  for (const source of SESSION_OVERRIDES[key]) {
    const value = source.read(input);
    if (value === undefined || value === '') continue;
    if (source.admit?.(value, input) !== false) return { value, from: source.name };
  }
  return undefined;
}
