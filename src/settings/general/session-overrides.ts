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
}

/** One place a key's value can come from, as a reader of the session input. */
export interface OverrideSource {
  readonly name: string;
  readonly read: (input: SessionInput) => string | undefined;
}

const flag = (name: string): OverrideSource => ({ name, read: (input) => input.flags[name] });
const variable = (name: string): OverrideSource => ({ name, read: (input) => input.env[name] });
const files = (): OverrideSource => ({
  name: 'settings files',
  read: (input) => input.settingsValue,
});

/** The keys with a per-session override, each with its sources highest first. */
export const SESSION_OVERRIDES = {
  // `--model` overrides `ANTHROPIC_MODEL`, which overrides the `model` key; `ANTHROPIC_DEFAULT_MODEL`
  // "applies only when no file sets `model`".
  model: [
    flag('--model'),
    variable('ANTHROPIC_MODEL'),
    files(),
    variable('ANTHROPIC_DEFAULT_MODEL'),
  ],
  // "`--effort` takes precedence over this key for one session, and `CLAUDE_CODE_EFFORT_LEVEL` takes precedence over both".
  effortLevel: [variable('CLAUDE_CODE_EFFORT_LEVEL'), flag('--effort'), files()],
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
    if (value !== undefined && value !== '') return { value, from: source.name };
  }
  return undefined;
}
