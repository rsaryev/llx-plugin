import type { Settings } from '../../protocol/official.ts';
import { SCOPE_LABEL } from '../broken-file.ts';
import type { PolicyScope } from '../layers.ts';
import { isRecord } from '../record.ts';
import { valueAt, withValueAt } from '../managed/paths.ts';
import { closedFound, drop, keep, type Check, type Checked, type Found } from './check-support.ts';
import { repairCredentials } from './sandbox-credentials.ts';
import {
  BOOLEAN_STANCES,
  SANDBOX_LISTS,
  STANCE_VALUE,
  WITHHELD_BY,
  type Stance,
} from './sandbox-fields.ts';

/**
 * A managed `sandbox` block, validated field by field (managed-settings.md, "Invalid values inside
 * `sandbox`"): one invalid value never drops the block. A quoted Boolean counts as that Boolean; an
 * invalid Boolean reads as the value that keeps the sandbox strictest; an invalid list entry is
 * dropped and a list with no valid entry does not apply; an invalid deny list withholds the allow
 * lists it restrains.
 */
interface State {
  readonly settings: Settings;
  readonly found: readonly Found[];
}

const isText = (entry: unknown): entry is string => typeof entry === 'string';
const field = (path: string): string => `sandbox.${path}`;
const atOf = (path: string): string => `.${path}`;

/** Applies one repair to the field at `path`: `change` returns the new value (`undefined` removes it) and what to say. */
type Step = (value: unknown, path: string) => { value: unknown; found: Found[] } | undefined;

function applyAt(state: State, path: string, step: Step): State {
  const current = valueAt(state.settings, field(path));
  if (current === undefined) return state;
  const changed = step(current, path);
  if (changed === undefined) return state;
  return {
    settings: withValueAt(state.settings, field(path), changed.value),
    found: [...state.found, ...changed.found],
  };
}

const booleanStep =
  (stance: Stance): Step =>
  (value, path) => {
    if (typeof value === 'boolean') return undefined;
    const name = field(path);
    if (value === 'true' || value === 'false') {
      return {
        value: value === 'true',
        found: [{ at: atOf(path), message: `"${name}" is the text "${value}": drop the quotes` }],
      };
    }
    const reads = STANCE_VALUE[stance];
    return reads === undefined
      ? {
          value: undefined,
          found: [
            { at: atOf(path), message: `"${name}" must be true or false; the value is dropped` },
          ],
        }
      : {
          value: reads,
          found: [closedFound(name, `it is treated as ${reads}`, atOf(path))],
        };
  };

/** What a list comes to, and whether it or any entry was invalid. */
function readList(value: unknown): { entries: readonly string[] | undefined; faulty: boolean } {
  if (!Array.isArray(value)) return { entries: undefined, faulty: true };
  const entries = value.filter(isText);
  return {
    entries: entries.length === 0 ? undefined : entries,
    faulty: entries.length < value.length,
  };
}

const listStep: Step = (value, path) => {
  const { entries, faulty } = readList(value);
  if (!faulty && entries !== undefined) return undefined;
  const message =
    entries === undefined
      ? `"${field(path)}" is not a list with a valid entry; the list does not apply`
      : `"${field(path)}" has an invalid entry; the entry is dropped`;
  return { value: entries, found: [{ at: atOf(path), message }] };
};

/** The allow lists a faulty deny list withholds. */
function withheld(state: State, faulty: readonly string[]): State {
  const paths = faulty.flatMap((deny) => WITHHELD_BY[deny] ?? []);
  return [...new Set(paths)].reduce(
    (current, path) =>
      applyAt(current, path, () => ({
        value: undefined,
        found: [
          {
            at: atOf(path),
            message: `"${field(path)}" is withheld until you fix ${faulty.map(field).join(', ')}`,
          },
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
  const repaired = repairCredentials(block);
  return {
    settings: withValueAt(state.settings, field('credentials'), repaired.value),
    found: [...state.found, ...repaired.found],
  };
}

/** The two keys of `sandbox` only a managed source can set. */
const MANAGED_ONLY = ['network.allowManagedDomainsOnly', 'filesystem.allowManagedReadPathsOnly'];

/** The block without the managed-only keys a source other than managed settings carries, each with a warning. */
function withoutManagedOnly(value: Readonly<Record<string, unknown>>, scope: PolicyScope): State {
  return MANAGED_ONLY.reduce<State>(
    (state, path) =>
      applyAt(state, path, () => ({
        value: undefined,
        found: [
          {
            at: atOf(path),
            message: `"${field(path)}" is not read from ${SCOPE_LABEL[scope]}; the key is ignored`,
          },
        ],
      })),
    { settings: { sandbox: value }, found: [] },
  );
}

export const sandbox: Check = (value, context): Checked => {
  if (!isRecord(value)) return drop(context.name, 'an object');
  if (context.scope !== 'managed') {
    const stripped = withoutManagedOnly(value, context.scope);
    if (!context.closed) return keep(stripped.settings.sandbox, stripped.found);
    return closedSandbox(stripped);
  }
  return closedSandbox({ settings: { sandbox: value }, found: [] });
};

function closedSandbox(start: State): Checked {
  const faulty = Object.keys(WITHHELD_BY).filter((path) => isFaulty(start.settings, path));
  const booleans = Object.entries(BOOLEAN_STANCES).reduce(
    (state, [path, stance]) => applyAt(state, path, booleanStep(stance)),
    credentialsOf(start),
  );
  const lists = SANDBOX_LISTS.reduce((state, path) => applyAt(state, path, listStep), booleans);
  const done = withheld(lists, faulty);
  return keep(done.settings.sandbox, done.found);
}
