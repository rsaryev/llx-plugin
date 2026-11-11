import { EFFORT_LEVELS } from '../../protocol/effort.ts';
import { CROSS_SESSION_MODES } from '../../protocol/settings-keys.ts';
import {
  kept,
  mustBe,
  note,
  presentButInvalid,
  stripInvalid,
  type Repair,
} from '../repair/support.ts';
import { attribution, worktree } from './closed-fields.ts';
import { sandbox } from './sandbox-check.ts';
import { commandLine } from './command-lines.ts';
import { parseTheme, TEAMMATE_MODES } from './look-and-feel.ts';
import { env } from '../env/check-env.ts';
import type { GeneralKey } from './keys.ts';
import { isRecord } from '../../protocol/is-record.ts';

/**
 * What a settings file may hold under each general key, checked as Claude Code does ("Settings
 * Warning: only individual entries fail, such as a malformed permission rule or an unknown hook
 * event name. Claude Code skips those values and keeps the rest of the file in effect", settings.md,
 * "Fix a broken settings file"). A value of the wrong type is dropped with a warning that names
 * the key; a malformed entry of a list is skipped on its own. In the policy tier a key that fails
 * closed reads as its restrictive value instead (managed-settings.md, "Keys that fail closed"). The
 * types are the SDK's `Settings` (docs/ARCHITECTURE.md, E2): these guards only read them at run time.
 */
const boolean: Repair = (value, at) =>
  typeof value === 'boolean' ? kept(value) : mustBe(at, 'true or false');

const text: Repair = (value, at) =>
  typeof value === 'string' ? kept(value) : mustBe(at, 'a string');

const oneOf =
  (...allowed: readonly string[]): Repair =>
  (value, at) =>
    typeof value === 'string' && allowed.includes(value)
      ? kept(value)
      : mustBe(at, `one of ${allowed.map((one) => `"${one}"`).join(', ')}`);

const object: Repair = (value, at) => (isRecord(value) ? kept(value) : mustBe(at, 'an object'));

const asText = (entry: unknown): string | undefined =>
  typeof entry === 'string' ? entry : undefined;

const textList: Repair = (value, at) => {
  if (!Array.isArray(value)) return mustBe(at, 'a list of strings');
  const read = stripInvalid(value, at, asText, `"${at.key}" entries must be strings`);
  return kept(read.entries, read.issues);
};

/**
 * `availableModels`: unreadable in managed settings it is "an empty allowlist until fixed, so only
 * the Default model is available"; a non-string entry is stripped and the rest enforced
 * (managed-settings.md, "Keys that fail closed").
 */
const modelAllowlist: Repair = (value, at) => {
  if (Array.isArray(value) || !at.closed) return textList(value, at);
  return kept(
    [],
    [presentButInvalid(at, 'it is an empty allowlist: only the Default model is available')],
  );
};

const isCrossSessionMode = (value: unknown): boolean =>
  CROSS_SESSION_MODES.some((mode) => mode === value);

/**
 * `crossSessionInbound`: an unrecognized value is reported with the text of errors.md. In managed
 * settings it reads as `refuse`; in a user, project, local or `--settings` file it holds inbound
 * messages "even when a source that takes precedence sets `accept`", which the layer records
 * (`PolicyLayer.invalid`, the `unreadable` floor of the key's exception).
 */
const crossSessionInbound: Repair = (value, at) => {
  if (isCrossSessionMode(value)) return kept(value);
  const prefix = `"${at.key}" must be one of ${CROSS_SESSION_MODES.map((mode) => `"${mode}"`).join(', ')}; received ${JSON.stringify(value)}. This value was ignored; while it is present, `;
  if (at.closed) {
    return kept('refuse', [
      note(
        at,
        '',
        `${prefix}cross-session messages are turned away until an administrator fixes it.`,
      ),
    ]);
  }
  return {
    value: undefined,
    invalid: true,
    issues: [
      note(
        at,
        '',
        `${prefix}cross-session messages are held for your approval instead of being delivered. Set it to one of the values above.`,
      ),
    ],
  };
};

const anyValue: Repair = (value) => kept(value);

/**
 * One check per general key. A dotted key lives inside a block and is read by its row's own guard
 * (`rows.ts`), so a file's top-level name of that shape is kept as written.
 */
export const GENERAL_CHECKS: { readonly [K in GeneralKey]: Repair } = {
  agent: text,
  disableAgentView: boolean,
  outputStyle: text,
  processWrapper: text,
  statusLine: commandLine,
  subagentStatusLine: commandLine,
  fileSuggestion: commandLine,
  teammateMode: oneOf(...TEAMMATE_MODES),
  theme: (value, at) =>
    typeof value === 'string' && parseTheme(value) !== undefined
      ? kept(value)
      : mustBe(at, 'a preset or custom theme reference'),
  'worktree.location': anyValue,
  attribution,
  'autoMode.classifyAllShell': anyValue,
  availableModels: modelAllowlist,
  crossSessionInbound,
  enableArtifact: boolean,
  env,
  fallbackModel: textList,
  isolatePeerMachines: boolean,
  maxEffortLevel: oneOf(...EFFORT_LEVELS),
  model: text,
  modelPicker: object,
  'permissions.blockReadsOutsideWorkingDirectories': anyValue,
  'permissions.blockWritesOutsideWorkingDirectories': anyValue,
  'permissions.defaultMode': anyValue,
  'permissions.denyInsteadOfPrompting': anyValue,
  remoteControlAtStartup: boolean,
  sandbox,
  'sandbox.filesystem.allowManagedReadPathsOnly': anyValue,
  'sandbox.filesystem.allowRead': anyValue,
  'sandbox.filesystem.disabled': anyValue,
  'sandbox.network.allowManagedDomainsOnly': anyValue,
  'sandbox.network.allowedDomains': anyValue,
  spinnerTipsEnabled: boolean,
  worktree,
};
