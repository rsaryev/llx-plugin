import { warning, type PluginIssue } from '../../format/issues.ts';
import type { Settings } from '../../protocol/official.ts';
import { readSettingsLayer } from '../read-layer.ts';
import { isRecord } from '../../protocol/is-record.ts';
import { utf8Length } from '../../format/utf8.ts';

/**
 * `policyHelper`: an executable that computes managed settings at startup (settings-reference.md,
 * `policyHelper`, "Write the helper output", "Helper failures", `policyHelper.path`,
 * `policyHelper.timeoutMs`, `policyHelper.refreshIntervalMs`; managed-settings.md, "Compute the
 * policy with a helper program"). This module judges the key and the helper's output; running the
 * process is `helper-run.ts`, through the command port.
 */
export const HELPER_DEFAULT_TIMEOUT_MS = 10_000;
export const HELPER_MIN_TIMEOUT_MS = 1000;
export const HELPER_MIN_REFRESH_MS = 60_000;
/** "Reads a JSON envelope from stdout, capped at 1 MiB"; a helper that writes more to stdout or to stderr fails. */
export const HELPER_OUTPUT_CAP_BYTES = 1024 * 1024;

/** The SDK's `policyHelper` with the timeout filled in: `refreshIntervalMs` stays unset until the settings say. */
type SdkPolicyHelper = NonNullable<Settings['policyHelper']>;
export type PolicyHelper = Required<Pick<SdkPolicyHelper, 'path' | 'timeoutMs'>> &
  Pick<SdkPolicyHelper, 'refreshIntervalMs'>;

export type HelperKey = { readonly helper: PolicyHelper } | { readonly issue: PluginIssue };

const isInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value);

/** Why the `policyHelper` value is invalid, or `undefined` when it is a valid object. */
function invalidReason(value: unknown): string | undefined {
  if (!isRecord(value)) return 'must be an object with a path, not a bare path';
  if (typeof value.path !== 'string') return 'needs a "path" text';
  const { timeoutMs, refreshIntervalMs } = value;
  if (timeoutMs !== undefined && !(isInteger(timeoutMs) && timeoutMs >= HELPER_MIN_TIMEOUT_MS)) {
    return `"timeoutMs" must be an integer of at least ${HELPER_MIN_TIMEOUT_MS}`;
  }
  const refreshOk =
    refreshIntervalMs === undefined ||
    (isInteger(refreshIntervalMs) &&
      (refreshIntervalMs === 0 || refreshIntervalMs >= HELPER_MIN_REFRESH_MS));
  return refreshOk
    ? undefined
    : `"refreshIntervalMs" must be 0 or an integer of at least ${HELPER_MIN_REFRESH_MS}`;
}

/**
 * Reads the key's value. An invalid value, such as a bare path or a `timeoutMs` below its minimum,
 * is "a dropped entry": the session starts on the remaining managed settings without a helper.
 */
export function readPolicyHelper(value: unknown): HelperKey {
  const reason = invalidReason(value);
  if (reason !== undefined || !isRecord(value) || typeof value.path !== 'string') {
    return {
      issue: warning(
        'managed:policyHelper',
        `"policyHelper" ${reason ?? 'is invalid'}; the entry is dropped and no helper runs`,
      ),
    };
  }
  const timeout = isInteger(value.timeoutMs) ? value.timeoutMs : HELPER_DEFAULT_TIMEOUT_MS;
  return {
    helper: {
      path: value.path,
      timeoutMs: timeout,
      ...(isInteger(value.refreshIntervalMs) ? { refreshIntervalMs: value.refreshIntervalMs } : {}),
    },
  };
}

/** The OS families `policyHelper.path` is judged for. */
export const PATH_FLAVORS = ['posix', 'windows'] as const;
export type PathFlavor = (typeof PATH_FLAVORS)[number];

const DOT_SEGMENT = /^\.{1,2}$/;

/** "An absolute path in normalized form, without `.` or `..` segments." */
function posixFault(path: string): string | undefined {
  if (!path.startsWith('/')) return 'is not an absolute path';
  const segments = path.slice(1).split('/');
  if (segments.some((segment) => DOT_SEGMENT.test(segment))) return 'has a "." or ".." segment';
  if (segments.some((segment) => segment === '') && path !== '/')
    return 'is not in normalized form';
  return undefined;
}

const WINDOWS_ROOT = /^(?:[A-Za-z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+[\\/])/;

/** "On Windows, a drive-letter or UNC path that ends in `.exe`." */
function windowsFault(path: string): string | undefined {
  const root = WINDOWS_ROOT.exec(path);
  if (root === null) return 'is not a drive-letter or UNC path';
  if (!path.toLowerCase().endsWith('.exe')) return 'does not end in .exe';
  const segments = path.slice(root[0].length).split(/[\\/]/);
  if (segments.some((segment) => DOT_SEGMENT.test(segment))) return 'has a "." or ".." segment';
  return segments.some((segment) => segment === '') ? 'is not in normalized form' : undefined;
}

const PATH_FAULTS: { readonly [F in PathFlavor]: (path: string) => string | undefined } = {
  posix: posixFault,
  windows: windowsFault,
};

/** Why `path` breaks the rules of `policyHelper.path`; a run with such a path fails. */
export const helperPathFault = (path: string, flavor: PathFlavor): string | undefined =>
  PATH_FAULTS[flavor](path);

/**
 * A settings repair that left something unreadable behind: the key ignored for
 * its shape, not one entry skipped, and not a key this source simply does not carry (one it "is not
 * read from", or a global config key).
 */
const UNREPAIRED = /(?:; the key is ignored|was present but invalid)/;
const NOT_CARRIED: readonly string[] = [' is not read from ', ' is a global config key '];
const isViolation = (message: string): boolean =>
  UNREPAIRED.test(message) && !NOT_CARRIED.some((marker) => message.includes(marker));

export type HelperOutput =
  | { readonly settings: Settings | undefined }
  | { readonly failure: string };

/** The `managedSettings` of an envelope that holds it, read as managed settings are, or why the run fails. */
function readEnvelope(envelope: Readonly<Record<string, unknown>>): HelperOutput {
  const emitted = envelope.managedSettings;
  if (emitted === undefined) return { settings: undefined };
  if (!isRecord(emitted)) return { failure: '"managedSettings" is not a JSON object' };
  const { layer, issues } = readSettingsLayer('managed', emitted, 'policyHelper');
  const left = issues.find((issue) => isViolation(issue.message));
  return left === undefined
    ? { settings: layer.settings }
    : {
        failure: `"managedSettings" has a schema violation that cannot be repaired: ${left.message}`,
      };
}

/**
 * What the helper's output comes to. A bare settings object with no `managedSettings` key "parses
 * with `managedSettings` undefined and applies nothing, and Claude Code reports no error". A schema
 * violation that survives the entry repairs fails the run: the helper's settings are held to a
 * stricter standard than a file's (managed-settings.md, "Find entries Claude Code dropped").
 */
export function readHelperOutput(stdout: string, stderr: string): HelperOutput {
  if (
    utf8Length(stdout) > HELPER_OUTPUT_CAP_BYTES ||
    utf8Length(stderr) > HELPER_OUTPUT_CAP_BYTES
  ) {
    return { failure: 'the helper wrote more than 1 MiB to stdout or stderr' };
  }
  let envelope: unknown;
  try {
    envelope = JSON.parse(stdout);
  } catch {
    return { failure: 'stdout is not a single JSON object' };
  }
  return isRecord(envelope)
    ? readEnvelope(envelope)
    : { failure: 'stdout is not a single JSON object' };
}
