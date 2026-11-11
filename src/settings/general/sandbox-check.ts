import type { PluginIssue } from '../../format/issues.ts';
import type { Settings } from '../../protocol/official.ts';
import { valueAt, withValueAt } from '../paths.ts';
import {
  kept,
  mustBe,
  note,
  presentButInvalid,
  type Repair,
  type RepairAt,
  type Repaired,
} from '../repair/support.ts';
import { repairCredentials } from './sandbox-credentials.ts';
import {
  BOOLEAN_STANCES,
  SANDBOX_LISTS,
  STANCE_VALUE,
  WITHHELD_BY,
  type Stance,
} from './sandbox-fields.ts';
import { isRecord } from '../../protocol/is-record.ts';

/**
 * A managed `sandbox` block, validated field by field (managed-settings.md, "Invalid values inside
 * `sandbox`"): one invalid value never drops the block. A quoted Boolean counts as that Boolean; an
 * invalid Boolean reads as the value that keeps the sandbox strictest; an invalid list entry is
 * dropped and a list with no valid entry does not apply; an invalid deny list withholds the allow
 * lists it restrains.
 */
interface State {
  readonly at: RepairAt;
  readonly settings: Settings;
  readonly found: readonly PluginIssue[];
}

const isText = (entry: unknown): entry is string => typeof entry === 'string';
const field = (path: string): string => `sandbox.${path}`;
const atOf = (path: string): string => `.${path}`;

/** Applies one repair to the field at `path`: `change` returns the new value (`undefined` removes it) and what to say. */
type Step = (
  value: unknown,
  path: string,
  at: RepairAt,
) => { value: unknown; found: PluginIssue[] } | undefined;

function applyAt(state: State, path: string, step: Step): State {
  const current = valueAt(state.settings, field(path));
  if (current === undefined) return state;
  const changed = step(current, path, state.at);
  if (changed === undefined) return state;
  return {
    ...state,
    settings: withValueAt(state.settings, field(path), changed.value),
    found: [...state.found, ...changed.found],
  };
}

const booleanStep =
  (stance: Stance): Step =>
  (value, path, at) => {
    if (typeof value === 'boolean') return undefined;
    const name = field(path);
    if (value === 'true' || value === 'false') {
      return {
        value: value === 'true',
        found: [note(at, atOf(path), `"${name}" is the text "${value}": drop the quotes`)],
      };
    }
    const reads = STANCE_VALUE[stance];
    return reads === undefined
      ? {
          value: undefined,
          found: [note(at, atOf(path), `"${name}" must be true or false; the key is ignored`)],
        }
      : {
          value: reads,
          found: [presentButInvalid(at, `it is treated as ${reads}`, atOf(path))],
        };
  };

/**
 * What a list comes to, and whether it or any entry was invalid. A list that is no array, or that
 * lost every entry it had, does not apply (`entries` is `undefined`); an empty list has no invalid
 * entry and stays (spec/judgments.md).
 */
function readList(value: unknown): { entries: readonly string[] | undefined; faulty: boolean } {
  if (!Array.isArray(value)) return { entries: undefined, faulty: true };
  const entries = value.filter(isText);
  return {
    entries: value.length > 0 && entries.length === 0 ? undefined : entries,
    faulty: entries.length < value.length,
  };
}

const listStep: Step = (value, path, at) => {
  const { entries, faulty } = readList(value);
  if (!faulty) return undefined;
  const message =
    entries === undefined
      ? `"${field(path)}" is not a list with a valid entry; the list does not apply`
      : `"${field(path)}" has an invalid entry; the entry is skipped`;
  return { value: entries, found: [note(at, atOf(path), message)] };
};

/** The allow lists a faulty deny list withholds. */
function withheld(state: State, faulty: readonly string[]): State {
  const paths = faulty.flatMap((deny) => WITHHELD_BY[deny] ?? []);
  return [...new Set(paths)].reduce(
    (current, path) =>
      applyAt(current, path, (_value, _path, at) => ({
        value: undefined,
        found: [
          note(
            at,
            atOf(path),
            `"${field(path)}" is withheld until you fix ${faulty.map(field).join(', ')}`,
          ),
        ],
      })),
    state,
  );
}

const isFaulty = (settings: Settings, path: string): boolean => {
  const current = valueAt(settings, field(path));
  return current !== undefined && readList(current).faulty;
};

function credentialsOf(state: State): State {
  const block = valueAt(state.settings, field('credentials'));
  if (block === undefined) return state;
  const repaired = repairCredentials(state.at, block);
  return {
    ...state,
    settings: withValueAt(state.settings, field('credentials'), repaired.value),
    found: [...state.found, ...repaired.found],
  };
}

/**
 * `sandbox`: outside the policy tier the block stays as written (a managed-only lock inside it is
 * left out by its own row's scope line, `readSettingsLayer`); in the policy tier it is repaired
 * field by field.
 */
export const sandbox: Repair = (value, at): Repaired => {
  if (!isRecord(value)) return mustBe(at, 'an object');
  if (!at.closed) return kept(value);
  return closedSandbox({ at, settings: { sandbox: value }, found: [] });
};

function closedSandbox(start: State): Repaired {
  const faulty = Object.keys(WITHHELD_BY).filter((path) => isFaulty(start.settings, path));
  const booleans = Object.entries(BOOLEAN_STANCES).reduce(
    (state, [path, stance]) => applyAt(state, path, booleanStep(stance)),
    credentialsOf(start),
  );
  const lists = SANDBOX_LISTS.reduce((state, path) => applyAt(state, path, listStep), booleans);
  const done = withheld(lists, faulty);
  return kept(done.settings.sandbox, done.found);
}
