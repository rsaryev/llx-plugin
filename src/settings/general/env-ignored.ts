import { REPOSITORY_FILES } from '../key-spec.ts';
import type { PolicyScope } from '../layers.ts';

/**
 * The `env` variables a checked-out repository cannot set (settings-reference.md, "Variables Claude
 * Code ignores in `env`"): "Project and local settings can't set variables that a checked-out
 * repository shouldn't control ... Claude Code drops each one, apart from a few values that turn
 * telemetry off". Modelled here: the session-content exporters and the OpenTelemetry exporter group
 * the page lists by name or by suffix. The page's open-ended lists ("such as" the OS directory and
 * Windows variables) are not enumerated (spec/judgments.md).
 */
const ALWAYS: ReadonlySet<string> = new Set([
  'OTEL_LOG_RAW_API_BODIES',
  'ENABLE_BETA_TRACING_DETAILED',
  'BETA_TRACING_ENDPOINT',
  'CLAUDE_CODE_ENABLE_TELEMETRY',
  'CLAUDE_CODE_ENHANCED_TELEMETRY_BETA',
  'ENABLE_ENHANCED_TELEMETRY_BETA',
  'OTEL_LOG_ASSISTANT_RESPONSES',
  'OTEL_EXPORTER_PROMETHEUS_HOST',
  'OTEL_EXPORTER_PROMETHEUS_PORT',
]);

/** `OTEL_EXPORTER_OTLP_*` names ending in one of the six suffixes, generic or per signal. */
const OTLP =
  /^OTEL_EXPORTER_OTLP_(?:.+_)?(?:ENDPOINT|HEADERS|PROTOCOL|CERTIFICATE|CLIENT_KEY|INSECURE)$/;

const OFF_VALUES: readonly string[] = ['0', 'false'];

/**
 * The variables whose one off value still applies from a repository, "because they turn something
 * off": `none` for the three exporter selectors, "an off value such as `0`" for the three content
 * variables. Which spellings are off values beyond `0` is the kit's judgment (spec/judgments.md).
 */
const OFF_VALUE_OF: ReadonlyMap<string, readonly string[]> = new Map([
  ['OTEL_LOGS_EXPORTER', ['none']],
  ['OTEL_METRICS_EXPORTER', ['none']],
  ['OTEL_TRACES_EXPORTER', ['none']],
  ['OTEL_LOG_USER_PROMPTS', OFF_VALUES],
  ['OTEL_LOG_TOOL_CONTENT', OFF_VALUES],
  ['OTEL_LOG_TOOL_DETAILS', OFF_VALUES],
]);

const isGroupVariable = (name: string): boolean =>
  ALWAYS.has(name) || OTLP.test(name) || OFF_VALUE_OF.has(name);

/** Whether Claude Code drops the variable `name` set to `value` in a file of `scope`. */
export function envIgnored(scope: PolicyScope, name: string, value: unknown): boolean {
  if (!REPOSITORY_FILES.includes(scope) || !isGroupVariable(name)) return false;
  const off = OFF_VALUE_OF.get(name);
  return (
    off === undefined || typeof value !== 'string' || !off.includes(value.trim().toLowerCase())
  );
}
