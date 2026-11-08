import type { Settings } from '../../protocol/official.ts';
import { isRecord } from '../record.ts';

/** Dotted paths into a settings object (`sandbox.network.allowedDomains`), the way the docs name a key inside a block. */
const splitPath = (path: string): readonly string[] => path.split('.');

/** The value at `path`, whatever the blocks on the way; `undefined` when a block is missing. */
export function valueAt(settings: Settings, path: string): unknown {
  return splitPath(path).reduce<unknown>(
    (block, name) => (isRecord(block) ? block[name] : undefined),
    settings,
  );
}

function written(
  block: Readonly<Record<string, unknown>>,
  names: readonly string[],
  value: unknown,
): Record<string, unknown> {
  const [name, ...rest] = names;
  if (name === undefined) return { ...block };
  const entries = Object.entries(block).filter(([existing]) => existing !== name);
  const inner = block[name];
  const next = rest.length === 0 ? value : written(isRecord(inner) ? inner : {}, rest, value);
  // `Object.fromEntries` defines own properties, so a JSON-parsed `__proto__` name stays a name.
  return Object.fromEntries(next === undefined ? entries : [...entries, [name, next]]);
}

/** The settings with `value` at `path` (the key removed when `value` is `undefined`); the blocks on the way are made. */
export const withValueAt = (settings: Settings, path: string, value: unknown): Settings =>
  written(settings, splitPath(path), value);
