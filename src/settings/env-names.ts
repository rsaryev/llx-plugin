/**
 * The variable names the `env` block of settings does not take from some files (settings-reference.md,
 * "Variables Claude Code ignores in `env`"). Names are data; `env.ts` decides what to do with them.
 */

/** A name list matched exactly, or without regard to case where the host's names are not case-sensitive. */
export interface NameList {
  readonly exact: ReadonlySet<string>;
  readonly prefixes: readonly string[];
  readonly patterns: readonly RegExp[];
}

const list = (
  exact: readonly string[],
  prefixes: readonly string[] = [],
  patterns: readonly RegExp[] = [],
): NameList => ({ exact: new Set(exact), prefixes, patterns });

/** Whether `name` is on the list; a Windows host's names are case-insensitive. */
export function onList(names: NameList, name: string, windows: boolean): boolean {
  const upper = name.toUpperCase();
  const exactNames = windows
    ? new Set([...names.exact].map((each) => each.toUpperCase()))
    : names.exact;
  return (
    exactNames.has(windows ? upper : name) ||
    names.prefixes.some((prefix) =>
      windows ? upper.startsWith(prefix.toUpperCase()) : name.startsWith(prefix),
    ) ||
    names.patterns.some((pattern) => pattern.test(name))
  );
}

/**
 * Project and local files cannot set these: "variables that a checked-out repository shouldn't
 * control". The groups follow the docs' bullets.
 *
 * Judgment (spec/judgments.md): "the `ProgramFiles` family" is every name that starts with
 * `ProgramFiles` plus `ProgramW6432`, the third of the family's names on Windows; "the operating-system
 * directory variables such as `HOME`, `TMPDIR`, `TMP`, `TEMP`, and the `XDG_*` family" is those names
 * and the prefix, no more.
 */
export const REPOSITORY_FORBIDDEN: NameList = list(
  [
    // Where Claude Code stores or writes its own files.
    'CLAUDE_CONFIG_DIR',
    'CLAUDE_CODE_TMPDIR',
    'HOME',
    'TMPDIR',
    'TMP',
    'TEMP',
    // Windows variables that pick programs and machine-wide configuration.
    'SystemRoot',
    'ComSpec',
    'ProgramData',
    'LOCALAPPDATA',
    'PATHEXT',
    'PSModulePath',
    'ProgramW6432',
    // Variables that export session content.
    'OTEL_LOG_RAW_API_BODIES',
    'ENABLE_BETA_TRACING_DETAILED',
    'BETA_TRACING_ENDPOINT',
    // The OpenTelemetry exporter variables that turn telemetry on, choose where it goes or what it captures.
    'CLAUDE_CODE_ENABLE_TELEMETRY',
    'CLAUDE_CODE_ENHANCED_TELEMETRY_BETA',
    'ENABLE_ENHANCED_TELEMETRY_BETA',
    'OTEL_LOGS_EXPORTER',
    'OTEL_METRICS_EXPORTER',
    'OTEL_TRACES_EXPORTER',
    'OTEL_LOG_USER_PROMPTS',
    'OTEL_LOG_ASSISTANT_RESPONSES',
    'OTEL_LOG_TOOL_CONTENT',
    'OTEL_LOG_TOOL_DETAILS',
    'OTEL_EXPORTER_PROMETHEUS_HOST',
    'OTEL_EXPORTER_PROMETHEUS_PORT',
    // How Claude Code starts or syncs.
    'CLAUDE_CODE_PROCESS_WRAPPER',
    'CLAUDE_CODE_SYNC_SKILLS',
    'CLAUDE_CODE_SYNC_PLUGINS',
    'CLAUDE_CODE_PLUGIN_CACHE_DIR',
    'CLAUDE_CODE_PLUGIN_SEED_DIR',
    // The claude.ai sign-in.
    'CLAUDE_CODE_OAUTH_TOKEN',
    'CLAUDE_CODE_OAUTH_REFRESH_TOKEN',
    'CLAUDE_CODE_OAUTH_SCOPES',
    // The dialog timer, attachments and file mentions.
    'CLAUDE_CODE_USER_DIALOG_TIMEOUT_MS',
    'CLAUDE_CODE_DISABLE_ATTACHMENTS',
    'CLAUDE_CODE_DISABLE_FILE_MENTIONS',
  ],
  ['XDG_', 'ProgramFiles', 'CLAUDE_AX_'],
  [/^OTEL_EXPORTER_OTLP_(?:\w+_)?(?:ENDPOINT|HEADERS|PROTOCOL|CERTIFICATE|CLIENT_KEY|INSECURE)$/],
);

/**
 * "Only these values still apply from project and local settings, because they turn something off:
 * `none` for the three exporter selectors, and an off value such as `0` for `OTEL_LOG_USER_PROMPTS`,
 * `OTEL_LOG_TOOL_CONTENT`, and `OTEL_LOG_TOOL_DETAILS`." Judgment: `false` is an off value too.
 */
export const OFF_VALUES: ReadonlyMap<string, readonly string[]> = new Map([
  ['OTEL_LOGS_EXPORTER', ['none']],
  ['OTEL_METRICS_EXPORTER', ['none']],
  ['OTEL_TRACES_EXPORTER', ['none']],
  ['OTEL_LOG_USER_PROMPTS', ['0', 'false']],
  ['OTEL_LOG_TOOL_CONTENT', ['0', 'false']],
  ['OTEL_LOG_TOOL_DETAILS', ['0', 'false']],
]);

/**
 * No file sets these: "Identity variables that Claude Code's hosting environments own, such as
 * `CLAUDE_CODE_REMOTE` and `CLAUDE_CODE_ACCOUNT_UUID`", the two messaging variables Claude Code
 * exports itself, and the variables it "reads from the launch environment only". Judgment: the
 * docs name no other identity variable, so no other is listed.
 */
export const HOST_OWNED: NameList = list([
  'CLAUDE_CODE_REMOTE',
  'CLAUDE_CODE_ACCOUNT_UUID',
  'CLAUDE_CODE_MESSAGING_SOCKET',
  'CLAUDE_CODE_MESSAGING_TOKEN',
  'CLAUDE_CODE_PROJECT_DIR_NAME',
  'CLAUDE_CODE_RESTRICTED',
  'CLAUDE_CODE_DISABLE_POWERSHELL_CMD_RM_DENY',
  'CLAUDE_CODE_DISABLE_DANGEROUS_RM_TIMEOUT',
  'CLAUDE_CODE_DISABLE_SUBSTITUTION_RM_PROMPT',
  'CLAUDE_CODE_DISABLE_INLINE_SHELL_RM_PROMPT',
  'CLAUDE_CODE_DISABLE_MOUNTED_DRIVE_RM_PROMPT',
]);
