import { EFFORT_LEVELS } from '../../protocol/effort.ts';
import {
  splitRule,
  invalidRuleMessage,
  MALFORMED_RULE,
} from '../../format/permission-rule-shape.ts';
import { SCOPE_LABEL } from '../broken-file.ts';
import type { PolicyScope } from '../layers.ts';
import { isRecord } from '../record.ts';
import { envIgnored } from './env-ignored.ts';
import type { GeneralKey } from './keys.ts';

/**
 * What a settings file may hold under each general key, checked as Claude Code does ("Settings
 * Warning: only individual entries fail, such as a malformed permission rule or an unknown hook
 * event name. Claude Code skips those values and keeps the rest of the file in effect", settings.md,
 * "Fix a broken settings file"). A value of the wrong type is dropped with a warning that names
 * the key; a malformed entry of a list is skipped on its own. The types are the SDK's `Settings`
 * (docs/ARCHITECTURE.md, E2): these guards only read them at run time.
 */
export interface Found {
  /** Where inside the key (`.allow[1]`); empty for the key itself. */
  readonly at: string;
  readonly message: string;
}

export interface Checked {
  /** What stays of the value; `undefined` when the key is dropped. */
  readonly value: unknown;
  readonly found: readonly Found[];
}

interface Context {
  readonly name: string;
  readonly scope: PolicyScope;
  /** The policy tier: an unreadable lock reads as its restrictive value. */
  readonly closed: boolean;
}

type Check = (value: unknown, context: Context) => Checked;

const keep = (value: unknown, found: readonly Found[] = []): Checked => ({ value, found });

const drop = (name: string, expected: string): Checked => ({
  value: undefined,
  found: [{ at: '', message: `"${name}" must be ${expected}; the key is ignored` }],
});

const boolean: Check = (value, { name }) =>
  typeof value === 'boolean' ? keep(value) : drop(name, 'true or false');

/**
 * A lock with one restrictive value (managed-settings.md, "Keys that fail closed"): in the policy
 * tier a value Claude Code cannot read reads as `true`, with a report.
 */
const lock: Check = (value, context) => {
  if (typeof value === 'boolean' || !context.closed) return boolean(value, context);
  return keep(true, [
    {
      at: '',
      message: `"${context.name}" was present but invalid; Claude Code treats it as true`,
    },
  ]);
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

/** The entries of a list that pass `valid`, and a note for each that does not. */
function entriesOf(
  list: readonly unknown[],
  at: string,
  valid: (entry: unknown) => string | undefined,
): { readonly kept: readonly unknown[]; readonly found: readonly Found[] } {
  const results = list.map((entry, index) => ({ entry, problem: valid(entry), index }));
  return {
    kept: results.flatMap((one) => (one.problem === undefined ? [one.entry] : [])),
    found: results.flatMap((one) =>
      one.problem === undefined ? [] : [{ at: `${at}[${one.index}]`, message: one.problem }],
    ),
  };
}

const notText = (name: string) => (entry: unknown) =>
  typeof entry === 'string' ? undefined : `"${name}" entries must be strings; the entry is skipped`;

const textList: Check = (value, { name }) => {
  if (!Array.isArray(value)) return drop(name, 'a list of strings');
  const read = entriesOf(value, '', notText(name));
  return keep(read.kept, read.found);
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
};

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
  availableModels: textList,
  crossSessionInbound: oneOf('accept', 'hold', 'refuse'),
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
  sandbox: object,
  spinnerTipsEnabled: boolean,
  useAutoModeDuringPlan: boolean,
};
