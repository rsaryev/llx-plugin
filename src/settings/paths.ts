import type { Settings } from '../protocol/official.ts';
import { isRecord } from '../protocol/is-record.ts';

/**
 * A key inside a block of a settings object, the way the docs name it: dotted
 * (`sandbox.network.allowedDomains`) or as its names down the blocks.
 */
export type SettingsPath = string | readonly string[];

const namesOf = (path: SettingsPath): readonly string[] =>
  typeof path === 'string' ? path.split('.') : path;

/** The value at `path`, whatever the blocks on the way; `undefined` when a block is missing. */
export function valueAt(settings: Settings, path: SettingsPath): unknown {
  return namesOf(path).reduce<unknown>(
    (block, name) => (isRecord(block) ? block[name] : undefined),
    settings,
  );
}

const isEmptyBlock = (value: unknown): boolean =>
  isRecord(value) && Object.keys(value).length === 0;

function written(
  block: Readonly<Record<string, unknown>>,
  names: readonly string[],
  value: unknown,
): Record<string, unknown> {
  const [name, ...rest] = names;
  if (name === undefined) return { ...block };
  const inner = block[name];
  // Nothing to remove where the block is not there: no empty block is made for it.
  if (value === undefined && rest.length > 0 && !isRecord(inner)) return { ...block };
  const next = rest.length === 0 ? value : written(isRecord(inner) ? inner : {}, rest, value);
  // A block the removal emptied is no block (a project file's `autoMode` held that one key).
  const absent = next === undefined || (value === undefined && isEmptyBlock(next));
  const entries = Object.entries(block).filter(([existing]) => existing !== name);
  // `Object.fromEntries` defines own properties, so a JSON-parsed `__proto__` name stays a name.
  return Object.fromEntries(absent ? entries : [...entries, [name, next]]);
}

/**
 * The settings with `value` at `path`, the blocks on the way made; with `value` `undefined` the key
 * is removed, and so is a block the removal leaves empty.
 */
export const withValueAt = (settings: Settings, path: SettingsPath, value: unknown): Settings =>
  written(settings, namesOf(path), value);
