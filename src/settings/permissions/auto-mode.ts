import { warning, type PluginIssue } from '../../format/issues.ts';
import {
  dropped,
  kept,
  stripInvalid,
  where,
  type Repair,
  type RepairAt,
} from '../repair/support.ts';
import type { PolicyView } from '../view.ts';
import { flagValue } from './read.ts';
import { isRecord } from '../../protocol/is-record.ts';

/**
 * The auto mode keys: the `autoMode` block that tells the classifier what the organization trusts,
 * and the three Booleans around it (settings-reference.md, `autoMode`, `autoMode.classifyAllShell`,
 * `useAutoModeDuringPlan`, `skipAutoPermissionPrompt`).
 */

/** The prose rule lists of the block, in the docs' order. */
export const AUTO_MODE_LISTS = ['environment', 'allow', 'soft_deny', 'hard_deny'] as const;
export type AutoModeList = (typeof AUTO_MODE_LISTS)[number];

/** The lists whose loss withholds the others: "a `soft_deny` or `hard_deny` list that can't be read". */
const RESTRICTING: readonly AutoModeList[] = ['soft_deny', 'hard_deny'];
/** The lists withheld while a restricting list cannot be read. */
const GRANTING: readonly AutoModeList[] = ['allow', 'environment'];

const fieldAt = (at: RepairAt, field: string): string => where(at, `.${field}`);

/** The one list of the block: its entries and whether anything was lost reading it. */
interface ListRead {
  readonly entries: readonly string[] | undefined;
  readonly lost: boolean;
  readonly issues: readonly PluginIssue[];
}

function readList(raw: unknown, at: RepairAt, field: string): ListRead {
  if (!Array.isArray(raw)) {
    return {
      entries: undefined,
      lost: true,
      issues: [warning(fieldAt(at, field), `"autoMode.${field}" must be a list; it is dropped`)],
    };
  }
  const read = stripInvalid(
    raw,
    at,
    (entry) => (typeof entry === 'string' ? entry : undefined),
    'Expected a text',
  );
  return { entries: read.entries, lost: read.issues.length > 0, issues: read.issues };
}

function withheld(
  fields: Record<string, unknown>,
  lostRestriction: readonly string[],
  at: RepairAt,
): PluginIssue[] {
  if (!at.closed || lostRestriction.length === 0) return [];
  const names = lostRestriction.map((name) => `"autoMode.${name}"`).join(' and ');
  return GRANTING.flatMap((list) => {
    if (fields[list] === undefined) return [];
    delete fields[list];
    return [
      warning(
        fieldAt(at, list),
        `"autoMode.${list}" is withheld: ${names} could not be read or lost an invalid entry`,
      ),
    ];
  });
}

/** What reading one field of the block gave. */
interface FieldRead {
  readonly value: unknown;
  readonly issues: readonly PluginIssue[];
  /** A restricting list that could not be read whole. */
  readonly lostRestriction: boolean;
}

const shellField = (raw: unknown, at: RepairAt): FieldRead => {
  const read = flagValue(raw, at, 'autoMode.classifyAllShell', true);
  return { value: read.value, issues: read.issues, lostRestriction: false };
};

const listField =
  (name: string) =>
  (raw: unknown, at: RepairAt): FieldRead => {
    const read = readList(raw, at, name);
    return {
      value: read.entries,
      issues: read.issues,
      lostRestriction: read.lost && RESTRICTING.some((list) => list === name),
    };
  };

const FIELDS: Readonly<Record<string, (raw: unknown, at: RepairAt) => FieldRead>> = {
  classifyAllShell: shellField,
  ...Object.fromEntries(AUTO_MODE_LISTS.map((list) => [list, listField(list)])),
};

const readField = (name: string, raw: unknown, at: RepairAt): FieldRead =>
  FIELDS[name]?.(raw, at) ?? { value: raw, issues: [], lostRestriction: false };

/** `autoMode` of one source, repaired per field. */
export const autoModeBlock: Repair = (value, at) => {
  if (!isRecord(value)) return dropped(at, `"${at.key}" must be an object`);
  const reads = Object.entries(value)
    .filter(([, raw]) => raw !== null)
    .map(([name, raw]) => ({ name, read: readField(name, raw, at) }));
  const fields: Record<string, unknown> = Object.fromEntries(
    reads
      .filter(({ read }) => read.value !== undefined)
      .map(({ name, read }) => [name, read.value]),
  );
  const lost = reads.filter(({ read }) => read.lostRestriction).map(({ name }) => name);
  const issues = [...reads.flatMap(({ read }) => read.issues), ...withheld(fields, lost, at)];
  return kept(fields, issues);
};

/**
 * A Boolean the user can only opt into, which the policy tier fails closed on: unreadable it reads
 * as `false` (the notice or the dialog still shows; the plan-mode classifier is off).
 */
export const consentBoolean: Repair = (value, at) => {
  const read = flagValue(value, at, at.key, false);
  return kept(read.value, read.issues);
};

/** The auto mode settings in force. */
export interface AutoModeSettings {
  /** The classifier's prose lists, every file's entries joined, highest source first. `$defaults` is kept as written. */
  readonly lists: { readonly [L in AutoModeList]: readonly string[] };
  /** "Send every shell command through the classifier": a `true` from user, `--settings` or managed applies. */
  readonly classifyAllShell: boolean;
  /** Plan mode uses the classifier: on unless a `false` from managed, `--settings`, user or local turns it off. */
  readonly useAutoModeDuringPlan: boolean;
  /** The one-time notice of auto mode is skipped. */
  readonly skipAutoPermissionPrompt: boolean;
}

/** The auto mode settings of a view (docs/API.md, "Settings"). */
export function autoModeSettings(view: PolicyView): AutoModeSettings {
  const block = view.get('autoMode');
  const list = (name: AutoModeList): readonly string[] => {
    const entries = block?.[name];
    return Array.isArray(entries) ? entries : [];
  };
  return {
    lists: {
      environment: list('environment'),
      allow: list('allow'),
      soft_deny: list('soft_deny'),
      hard_deny: list('hard_deny'),
    },
    classifyAllShell: view.get('autoMode.classifyAllShell') === true,
    useAutoModeDuringPlan: view.get('useAutoModeDuringPlan') !== false,
    skipAutoPermissionPrompt: view.get('skipAutoPermissionPrompt') === true,
  };
}
