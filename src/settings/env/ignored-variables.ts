import { REPOSITORY_FILES } from '../key-spec.ts';
import type { PolicyScope } from '../layers.ts';

/**
 * The `env` variables Claude Code drops (settings-reference.md, "Variables Claude Code ignores in
 * `env`"), as data. Two lists: the variables "a checked-out repository shouldn't control", dropped
 * from project and local settings, and the variables Claude Code reads from the launch environment
 * only or exports itself, dropped from every file. The page's two open-ended lists ("such as" the
 * operating-system directories, the hosting-environment identity variables) hold the names the page
 * spells out and nothing the kit would have to guess (spec/judgments.md).
 */
const IGNORE_REASONS = [
  'storage',
  'windows',
  'session-content',
  'telemetry',
  'startup',
  'sign-in',
  'accessibility',
  'dialog-timer',
  'attachments',
  'file-mentions',
  'identity',
  'launch-only',
] as const;
export type IgnoreReason = (typeof IGNORE_REASONS)[number];

interface Group {
  readonly reason: IgnoreReason;
  /** Which files lose the variable: a repository's (project and local) or every one. */
  readonly from: 'repository' | 'every file';
  readonly names: readonly string[];
  /** A family named by its start (`XDG_*`, `CLAUDE_AX_*`, the `ProgramFiles` family). */
  readonly prefixes?: readonly string[];
  /** A family named by its end (`OTEL_EXPORTER_OTLP_*_ENDPOINT`). */
  readonly pattern?: RegExp;
  /** Windows names are case-insensitive, so these compare without regard to case (spec/judgments.md). */
  readonly caseInsensitive?: boolean;
}

/** `OTEL_EXPORTER_OTLP_*` names ending in one of the six suffixes, generic or per signal. */
const OTLP =
  /^OTEL_EXPORTER_OTLP_(?:.+_)?(?:ENDPOINT|HEADERS|PROTOCOL|CERTIFICATE|CLIENT_KEY|INSECURE)$/;

const GROUPS: readonly Group[] = [
  {
    reason: 'storage',
    from: 'repository',
    names: ['CLAUDE_CONFIG_DIR', 'CLAUDE_CODE_TMPDIR', 'HOME', 'TMPDIR', 'TMP', 'TEMP'],
    prefixes: ['XDG_'],
  },
  {
    reason: 'windows',
    from: 'repository',
    // "the `ProgramFiles` family": `ProgramFiles`, `ProgramFiles(x86)` and `ProgramW6432` (spec/judgments.md).
    names: [
      'SystemRoot',
      'ComSpec',
      'ProgramData',
      'LOCALAPPDATA',
      'PATHEXT',
      'PSModulePath',
      'ProgramW6432',
    ],
    prefixes: ['ProgramFiles'],
    caseInsensitive: true,
  },
  {
    reason: 'session-content',
    from: 'repository',
    names: ['OTEL_LOG_RAW_API_BODIES', 'ENABLE_BETA_TRACING_DETAILED', 'BETA_TRACING_ENDPOINT'],
  },
  {
    reason: 'telemetry',
    from: 'repository',
    names: [
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
    ],
    pattern: OTLP,
  },
  {
    reason: 'startup',
    from: 'repository',
    names: [
      'CLAUDE_CODE_PROCESS_WRAPPER',
      'CLAUDE_CODE_SYNC_SKILLS',
      'CLAUDE_CODE_SYNC_PLUGINS',
      'CLAUDE_CODE_PLUGIN_CACHE_DIR',
      'CLAUDE_CODE_PLUGIN_SEED_DIR',
    ],
  },
  {
    reason: 'sign-in',
    from: 'repository',
    names: [
      'CLAUDE_CODE_OAUTH_TOKEN',
      'CLAUDE_CODE_OAUTH_REFRESH_TOKEN',
      'CLAUDE_CODE_OAUTH_SCOPES',
    ],
  },
  {
    reason: 'accessibility',
    from: 'repository',
    names: ['CLAUDE_AX_SCREEN_READER'],
    prefixes: ['CLAUDE_AX_'],
  },
  { reason: 'dialog-timer', from: 'repository', names: ['CLAUDE_CODE_USER_DIALOG_TIMEOUT_MS'] },
  { reason: 'attachments', from: 'repository', names: ['CLAUDE_CODE_DISABLE_ATTACHMENTS'] },
  { reason: 'file-mentions', from: 'repository', names: ['CLAUDE_CODE_DISABLE_FILE_MENTIONS'] },
  {
    reason: 'identity',
    from: 'every file',
    names: ['CLAUDE_CODE_REMOTE', 'CLAUDE_CODE_ACCOUNT_UUID'],
  },
  {
    reason: 'launch-only',
    from: 'every file',
    names: [
      'CLAUDE_CODE_MESSAGING_SOCKET',
      'CLAUDE_CODE_MESSAGING_TOKEN',
      'CLAUDE_CODE_PROJECT_DIR_NAME',
      'CLAUDE_CODE_RESTRICTED',
      'CLAUDE_CODE_DISABLE_POWERSHELL_CMD_RM_DENY',
      'CLAUDE_CODE_DISABLE_DANGEROUS_RM_TIMEOUT',
      'CLAUDE_CODE_DISABLE_SUBSTITUTION_RM_PROMPT',
      'CLAUDE_CODE_DISABLE_INLINE_SHELL_RM_PROMPT',
      'CLAUDE_CODE_DISABLE_MOUNTED_DRIVE_RM_PROMPT',
      'CLAUDE_CODE_EVEN_MORE_DANGEROUSLY_SKIP_PERMISSIONS',
      'CLAUDE_CODE_WARN_DISK_FREE_GIB',
      'CLAUDE_CODE_WARN_MEMORY_FREE_GIB',
    ],
  },
];

/** Whether the group names `name`; a Windows host's names, and the Windows group's anywhere, compare without case. */
function named(group: Group, name: string, windows: boolean): boolean {
  const fold = (text: string): string =>
    windows || group.caseInsensitive === true ? text.toUpperCase() : text;
  const candidate = fold(name);
  return (
    group.names.some((one) => fold(one) === candidate) ||
    (group.prefixes ?? []).some((prefix) => candidate.startsWith(fold(prefix))) ||
    (group.pattern?.test(windows ? candidate : name) ?? false)
  );
}

/**
 * The variables whose one off value still applies from a repository, "because they turn something
 * off": `none` for the three exporter selectors, "an off value such as `0`" for the three content
 * variables. Which spellings are off values beyond `0` is the kit's judgment (spec/judgments.md).
 */
const OFF_VALUES: readonly string[] = ['0', 'false'];
const OFF_VALUE_OF: ReadonlyMap<string, readonly string[]> = new Map([
  ['OTEL_LOGS_EXPORTER', ['none']],
  ['OTEL_METRICS_EXPORTER', ['none']],
  ['OTEL_TRACES_EXPORTER', ['none']],
  ['OTEL_LOG_USER_PROMPTS', OFF_VALUES],
  ['OTEL_LOG_TOOL_CONTENT', OFF_VALUES],
  ['OTEL_LOG_TOOL_DETAILS', OFF_VALUES],
]);

/**
 * The text of an `env` value as the process gets it: claude sets JavaScript's `String(value)` for a
 * value that is not a string (oracle 2.1.321, spec/judgments.md `src/settings/env/check-env.ts`).
 */
export const envText = (value: unknown): string =>
  typeof value === 'string' ? value : String(value);

/**
 * Whether `value` is one of the off values that still apply from a project or local file for `name`:
 * the value in any case, as written otherwise; on a Windows host the name in any case too.
 */
export function turnsTelemetryOff(name: string, value: unknown, windows = false): boolean {
  const off = OFF_VALUE_OF.get(windows ? name.toUpperCase() : name);
  return off !== undefined && typeof value === 'string' && off.includes(value.toLowerCase());
}

/**
 * Why Claude Code drops the variable `name` set to `value` in a file of `scope`, or `undefined` when
 * the variable stays. `windows`: the host's variable names are case-insensitive.
 */
export function ignoredBecause(
  scope: PolicyScope,
  name: string,
  value: unknown,
  windows = false,
): IgnoreReason | undefined {
  const fromRepository = REPOSITORY_FILES.includes(scope);
  const group = GROUPS.find(
    (one) => (fromRepository || one.from === 'every file') && named(one, name, windows),
  );
  if (group === undefined) return undefined;
  return fromRepository && turnsTelemetryOff(name, value, windows) ? undefined : group.reason;
}
