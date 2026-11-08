import { EFFORT_LEVELS } from '../../protocol/effort.ts';
import { CROSS_SESSION_MODES } from '../../protocol/settings-keys.ts';
import {
  splitRule,
  invalidRuleMessage,
  MALFORMED_RULE,
} from '../../format/permission-rule-shape.ts';
import { SCOPE_LABEL } from '../broken-file.ts';
import { isRecord } from '../record.ts';
import {
  closedFound,
  drop,
  entriesOf,
  keep,
  notText,
  type Check,
  type Checked,
} from './check-support.ts';
import { autoMode, failClosedPermissions } from './closed-blocks.ts';
import { sandbox } from './sandbox-check.ts';
import { envIgnored } from './env-ignored.ts';
import type { GeneralKey } from './keys.ts';

/**
 * What a settings file may hold under each general key, checked as Claude Code does ("Settings
 * Warning: only individual entries fail, such as a malformed permission rule or an unknown hook
 * event name. Claude Code skips those values and keeps the rest of the file in effect", settings.md,
 * "Fix a broken settings file"). A value of the wrong type is dropped with a warning that names
 * the key; a malformed entry of a list is skipped on its own. In the policy tier a key that fails
 * closed reads as its restrictive value instead (managed-settings.md, "Keys that fail closed"). The
 * types are the SDK's `Settings` (docs/ARCHITECTURE.md, E2): these guards only read them at run time.
 */
const boolean: Check = (value, { name }) =>
  typeof value === 'boolean' ? keep(value) : drop(name, 'true or false');

/**
 * A lock with one restrictive value (managed-settings.md, "Keys that fail closed"): in the policy
 * tier a value Claude Code cannot read reads as `true`, with a report.
 */
const lock: Check = (value, context) => {
  if (typeof value === 'boolean' || !context.closed) return boolean(value, context);
  // "The string "true" or "false" reads as that Boolean, with a notice asking you to drop the quotes."
  if (value === 'true' || value === 'false') {
    return keep(value === 'true', [
      { at: '', message: `"${context.name}" is the text "${value}": drop the quotes` },
    ]);
  }
  return keep(true, [closedFound(context.name, 'it is treated as true')]);
};

const text: Check = (value, { name }) =>
  typeof value === 'string' ? keep(value) : drop(name, 'a string');

const oneOf =
  (...allowed: readonly string[]): Check =>
  (value, { name }) =>
    typeof value === 'string' && allowed.includes(value)
      ? keep(value)
      : drop(name, `one of ${allowed.map((one) => `"${one}"`).join(', ')}`);

const object: Check = (value, { name }) =>
  isRecord(value) ? keep(value) : drop(name, 'an object');

const textList: Check = (value, { name }) => {
  if (!Array.isArray(value)) return drop(name, 'a list of strings');
  const read = entriesOf(value, '', notText(name));
  return keep(read.kept, read.found);
};

/**
 * `availableModels`: unreadable in managed settings it is "an empty allowlist until fixed, so only
 * the Default model is available"; a non-string entry is stripped and the rest enforced
 * (managed-settings.md, "Keys that fail closed").
 */
const modelAllowlist: Check = (value, context) => {
  if (Array.isArray(value) || !context.closed) return textList(value, context);
  return keep(
    [],
    [closedFound(context.name, 'it is an empty allowlist: only the Default model is available')],
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
const crossSessionInbound: Check = (value, context) => {
  if (isCrossSessionMode(value)) return keep(value);
  const prefix = `"${context.name}" must be one of ${CROSS_SESSION_MODES.map((mode) => `"${mode}"`).join(', ')}; received ${JSON.stringify(value)}. This value was ignored; while it is present, `;
  if (context.closed) {
    return {
      value: 'refuse',
      found: [
        {
          at: '',
          message: `${prefix}cross-session messages are turned away until an administrator fixes it.`,
        },
      ],
    };
  }
  return {
    value: undefined,
    invalid: true,
    found: [
      {
        at: '',
        message: `${prefix}cross-session messages are held for your approval instead of being delivered. Set it to one of the values above.`,
      },
    ],
  };
};

/** A rule of `permissions.allow`, `deny` or `ask`: a string of the shape `Tool` or `Tool(content)`. */
const ruleProblem = (entry: unknown): string | undefined => {
  if (typeof entry !== 'string') return 'A permission rule must be a string; the rule is skipped';
  return splitRule(entry) === undefined ? invalidRuleMessage(entry, MALFORMED_RULE) : undefined;
};

const RULE_LISTS = ['allow', 'deny', 'ask'] as const;

function checkedList(block: Readonly<Record<string, unknown>>, name: string) {
  const list = block[name];
  if (list === undefined) return keep(undefined);
  if (!Array.isArray(list)) {
    return {
      value: undefined,
      found: [
        { at: `.${name}`, message: `"permissions.${name}" must be a list; the list is ignored` },
      ],
    };
  }
  const isRule = (RULE_LISTS as readonly string[]).includes(name);
  const read = entriesOf(list, `.${name}`, isRule ? ruleProblem : notText(`permissions.${name}`));
  return keep(read.kept, read.found);
}

/** `permissions`: the rule lists and `additionalDirectories` are read entry by entry, every other field stays as written. */
const permissions: Check = (value, context) => {
  if (!isRecord(value)) return drop(context.name, 'an object');
  const read = readPermissions(value);
  return context.closed ? failClosedPermissions(value, read) : read;
};

function readPermissions(value: Readonly<Record<string, unknown>>): Checked {
  const lists = [...RULE_LISTS, 'additionalDirectories'].map((name) => ({
    name,
    ...checkedList(value, name),
  }));
  const fields = Object.entries(value).filter(([key]) => !lists.some((one) => one.name === key));
  const kept = lists.flatMap((one) => (one.value === undefined ? [] : [[one.name, one.value]]));
  return keep(
    Object.fromEntries([...fields, ...kept]),
    lists.flatMap((one) => one.found),
  );
}

/** `env`: a repository file loses the variables Claude Code ignores there, named, never their values. */
const env: Check = (value, context) => {
  if (!isRecord(value)) return drop(context.name, 'an object');
  const entries = Object.entries(value);
  const ignored = entries.filter(([name, one]) => envIgnored(context.scope, name, one));
  return keep(
    Object.fromEntries(entries.filter((entry) => !ignored.includes(entry))),
    ignored.map(([name]) => ({
      at: `.${name}`,
      message: `"${name}" is ignored from ${SCOPE_LABEL[context.scope]}: a checked-out repository cannot set it`,
    })),
  );
};

const anyValue: Check = (value) => keep(value);

/**
 * One check per general key. A dotted key lives inside a block and is read by its row's own guard
 * (`rows.ts`), so a file's top-level name of that shape is kept as written.
 */
export const GENERAL_CHECKS: { readonly [K in GeneralKey]: Check } = {
  allowManagedPermissionRulesOnly: lock,
  'autoMode.classifyAllShell': anyValue,
  autoMode,
  availableModels: modelAllowlist,
  crossSessionInbound,
  disableClaudeAiConnectors: boolean,
  enableArtifact: boolean,
  env,
  fallbackModel: textList,
  isolatePeerMachines: boolean,
  maxEffortLevel: oneOf(...EFFORT_LEVELS),
  model: text,
  modelPicker: object,
  permissions,
  'permissions.blockReadsOutsideWorkingDirectories': anyValue,
  'permissions.blockWritesOutsideWorkingDirectories': anyValue,
  'permissions.defaultMode': anyValue,
  remoteControlAtStartup: boolean,
  sandbox,
  'sandbox.filesystem.allowManagedReadPathsOnly': anyValue,
  'sandbox.network.allowManagedDomainsOnly': anyValue,
  spinnerTipsEnabled: boolean,
  useAutoModeDuringPlan: boolean,
};
