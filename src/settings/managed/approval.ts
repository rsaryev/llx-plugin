import { isFalsyEnv, isTruthyEnv } from '../../format/env-flag.ts';
import { isRecord } from '../../protocol/is-record.ts';

/**
 * Which delivered settings need the user's approval before they apply (server-managed-settings.md,
 * "Security approval dialogs" and "Environment variables and the approval dialog"). Pure: the host
 * shows the dialog; the kit says what it must name.
 */

export type ApprovalKind =
  | 'shell-command'
  | 'sandbox-binary'
  | 'sandbox-network-isolation'
  | 'custom-env'
  | 'hook';

export interface ApprovalItem {
  readonly kind: ApprovalKind;
  /** The setting (or `env.NAME`) the dialog names. */
  readonly key: string;
}

type Block = Readonly<Record<string, unknown>>;

/** "settings that execute shell commands, such as `apiKeyHelper`, `statusLine`, and `otelHeadersHelper`". */
const SHELL_COMMAND_KEYS = ['apiKeyHelper', 'statusLine', 'otelHeadersHelper'];

/** "`sandbox.bwrapPath`, `sandbox.socatPath`, and `sandbox.ripgrep`". */
const SANDBOX_BINARY_KEYS = ['bwrapPath', 'socatPath', 'ripgrep'];

/** The sandbox settings "that let the sandbox proxy read, reroute, or authenticate traffic, or that weaken the sandbox's isolation". */
const SANDBOX_ISOLATION_PATHS: readonly (readonly string[])[] = [
  ['network', 'tlsTerminate'],
  ['network', 'httpProxyPort'],
  ['network', 'socksProxyPort'],
  ['allowAppleEvents'],
  ['allowNestedUserNamespaces'],
  ['enableWeakerNestedSandbox'],
  ['enableWeakerNetworkIsolation'],
  ['filesystem', 'disabled'],
  ['network', 'allowAllUnixSockets'],
  ['network', 'allowUnixSockets'],
  ['network', 'allowMachLookup'],
];

const at = (block: unknown, path: readonly string[]): unknown =>
  path.reduce<unknown>((inner, name) => (isRecord(inner) ? inner[name] : undefined), block);

const isSet = (value: unknown): boolean => value !== undefined && value !== null;

/** A `sandbox.credentials` block with only `deny` rules "restricts the sandbox without giving the proxy a credential". */
function credentialsNeedApproval(credentials: unknown): boolean {
  if (!isRecord(credentials)) return false;
  return Object.entries(credentials).some(([name, value]) => {
    if (name !== 'files' && name !== 'envVars') return isSet(value);
    return Array.isArray(value) && value.some((entry) => at(entry, ['mode']) !== 'deny');
  });
}

function sandboxItems(sandbox: unknown): ApprovalItem[] {
  if (!isRecord(sandbox)) return [];
  const binaries = SANDBOX_BINARY_KEYS.filter((name) => isSet(sandbox[name])).map(
    (name): ApprovalItem => ({ kind: 'sandbox-binary', key: `sandbox.${name}` }),
  );
  const isolation = SANDBOX_ISOLATION_PATHS.filter((path) => isSet(at(sandbox, path))).map(
    (path): ApprovalItem => ({
      kind: 'sandbox-network-isolation',
      key: `sandbox.${path.join('.')}`,
    }),
  );
  const credentials = credentialsNeedApproval(sandbox['credentials'])
    ? [{ kind: 'sandbox-network-isolation', key: 'sandbox.credentials' } satisfies ApprovalItem]
    : [];
  return [...binaries, ...isolation, ...credentials];
}

/** Variables that "always" need approval "at any non-empty value": proxy and base-URL variables, the OTLP endpoint, the 1M-context switch. */
const ALWAYS =
  /^(?:(?:HTTPS?|ALL|NO)_PROXY|ANTHROPIC_(?:BEDROCK_|VERTEX_|FOUNDRY_|AWS_)?BASE_URL|OTEL_EXPORTER_OTLP_(?:\w+_)?ENDPOINT|CLAUDE_CODE_DISABLE_1M_CONTEXT)$/i;
/** Decided by value: a truthy one "only turns tracking, reporting, or other nonessential traffic off". */
const PRIVACY_TOGGLES = [
  'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC',
  'DISABLE_ERROR_REPORTING',
  'DISABLE_TELEMETRY',
  'DO_NOT_TRACK',
  'API_FORCE_IDLE_TIMEOUT',
];
/** A falsy value "only turns detailed tracing or raw API body capture off". */
const TRACING_TOGGLES = ['ENABLE_BETA_TRACING_DETAILED', 'OTEL_LOG_RAW_API_BODIES'];

/** Header names "that name a credential, an org or tenant selector, a routing or host override, or an API-behavior header". */
const RISKY_HEADER_WORDS =
  /auth|api-?key|token|secret|credential|cookie|org|tenant|account|workspace|host|forward|route|proxy|beta|version|client|bedrock|amzn/i;
const HEADER_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const TAB = 9;
/** A character an HTTP header value cannot carry: a control character other than the tab, or DEL. */
const cannotCarry = (text: string): boolean =>
  Array.from({ length: text.length }, (_, index) => text.charCodeAt(index)).some(
    (code) => (code < 32 && code !== TAB) || code === 127,
  );

/** Whether `ANTHROPIC_CUSTOM_HEADERS` lines need approval: tagging headers such as `Accept-Language` do not. */
function headersNeedApproval(value: string): boolean {
  return value
    .split('\n')
    .filter((line) => line.trim() !== '')
    .some((line) => {
      const colon = line.indexOf(':');
      const name = colon < 0 ? line.trim() : line.slice(0, colon).trim();
      const content = colon < 0 ? '' : line.slice(colon + 1);
      return (
        colon < 0 ||
        !HEADER_TOKEN.test(name) ||
        cannotCarry(content) ||
        RISKY_HEADER_WORDS.test(name)
      );
    });
}

function envNeedsApproval(name: string, value: string): boolean {
  if (value === '') return false;
  if (PRIVACY_TOGGLES.includes(name)) return !isTruthyEnv(value);
  if (TRACING_TOGGLES.includes(name)) return !isFalsyEnv(value);
  if (name === 'ANTHROPIC_CUSTOM_HEADERS') return headersNeedApproval(value);
  return ALWAYS.test(name);
}

function envItems(env: unknown): ApprovalItem[] {
  if (!isRecord(env)) return [];
  return Object.entries(env)
    .filter(([name, value]) => typeof value === 'string' && envNeedsApproval(name, value))
    .map(([name]): ApprovalItem => ({ kind: 'custom-env', key: `env.${name}` }));
}

/** Any hook definition, in any event. */
function hookItems(hooks: unknown): ApprovalItem[] {
  if (!isRecord(hooks)) return [];
  const defined = Object.values(hooks).some((groups) => Array.isArray(groups) && groups.length > 0);
  return defined ? [{ kind: 'hook', key: 'hooks' }] : [];
}

/**
 * The items of delivered settings that need approval, in a stable order. `claudeMd` is not one:
 * "it's instruction text for Claude rather than a command Claude Code runs".
 */
export function approvalItems(settings: Block): readonly ApprovalItem[] {
  const shell = SHELL_COMMAND_KEYS.filter((name) => isSet(settings[name])).map(
    (name): ApprovalItem => ({ kind: 'shell-command', key: name }),
  );
  return [
    ...shell,
    ...sandboxItems(settings['sandbox']),
    ...envItems(settings['env']),
    ...hookItems(settings['hooks']),
  ];
}
