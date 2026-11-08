import { error, type PluginIssue } from '../../format/issues.ts';
import type { Settings } from '../../protocol/official.ts';
import { MERGES } from '../merge.ts';
import { isRecord } from '../record.ts';
import {
  readAdminDocument,
  type AdminDocument,
  type SourceRead,
  type UnreadableCause,
} from './admin-source.ts';

/**
 * A file-based policy split across teams (managed-settings.md, "Split a file-based policy across
 * teams"): `managed-settings.json` first, then every `*.json` of `managed-settings.d/` in
 * alphabetical order, "the later file's value replaces the earlier one". The host lists the folder
 * and reads each file; this module orders them, merges them and reports what is broken.
 */
export interface DropInFile {
  readonly name: string;
  readonly read: SourceRead;
}

/** The `managed-settings.d/` folder: absent, present and unreadable, or its files. */
export type DropInDirectory =
  | undefined
  | { readonly unreadable: UnreadableCause }
  | { readonly files: readonly DropInFile[] };

export interface ManagedFileRead {
  /** `managed-settings.json`. */
  readonly base: SourceRead;
  readonly dropIns?: DropInDirectory;
  /** What a report calls each file: its path. */
  readonly label?: { readonly base?: string; readonly dropIn?: (name: string) => string };
}

/** "Claude Code ignores hidden files and files that don't end in `.json`." */
export const isDropInName = (name: string): boolean =>
  name.endsWith('.json') && !name.startsWith('.');

/**
 * The drop-in names in the order they merge: alphabetical, so numeric prefixes (`10-telemetry.json`,
 * `20-security.json`) control it. Plain code-unit order: the docs say "alphabetical" and no locale
 * (spec/judgments.md).
 */
export const dropInOrder = (names: readonly string[]): string[] =>
  names.filter(isDropInName).toSorted((a, b) => (a < b ? -1 : a > b ? 1 : 0));

/** Keys where "the later chain/lineup replaces the earlier one whole". */
const REPLACED_WHOLE: readonly string[] = ['fallbackModel', 'modelPicker'];
/** Keys where "a later entry with the same name replaces the earlier one whole". */
const REPLACED_BY_NAME: readonly string[] = ['extraKnownMarketplaces', 'managedMcpServers'];

const laterSet = (parts: readonly Settings[], key: string): unknown =>
  parts.map((part) => part[key]).find((value) => value !== undefined);

/**
 * The files' settings as one, later files first in `parts`: single values replaced, lists combined
 * with duplicates removed, nested blocks merged key by key with each key under these rules, and the
 * keys above replaced whole.
 */
export function mergeDropIns(parts: readonly Settings[]): Settings {
  const merged = MERGES.deepMerge.combine(parts);
  const whole = REPLACED_WHOLE.map((key): [string, unknown] => [key, laterSet(parts, key)]);
  const byName = REPLACED_BY_NAME.map((key): [string, unknown] => [
    key,
    parts.some((part) => isRecord(part[key]))
      ? MERGES.perKeyHighestWins.combine(parts.map((part) => part[key]).filter(isRecord))
      : undefined,
  ]);
  const replaced = [...whole, ...byName].filter(([, value]) => value !== undefined);
  // `Object.fromEntries` defines own properties, so a JSON-parsed `__proto__` name stays a name.
  return { ...merged, ...Object.fromEntries(replaced) };
}

/** The shapes the file source takes in `/status`: `(file)`, `(drop-ins)` or `(file + drop-ins)`. */
export const FILE_SHAPES = ['file', 'drop-ins', 'file + drop-ins'] as const;
export type FileShape = (typeof FILE_SHAPES)[number];

const SHAPE_OF: Readonly<Record<string, FileShape>> = {
  'true,false': 'file',
  'false,true': 'drop-ins',
  'true,true': 'file + drop-ins',
};

interface Parts {
  readonly documents: readonly AdminDocument[];
  readonly unreadable?: UnreadableCause;
  readonly issues: readonly PluginIssue[];
}

function readParts(read: ManagedFileRead): Parts {
  const documents: AdminDocument[] = [];
  const issues: PluginIssue[] = [];
  let unreadable: UnreadableCause | undefined;
  const take = (source: SourceRead, label: string | undefined): void => {
    if (source !== undefined && 'unreadable' in source) unreadable ??= source.unreadable;
    documents.push(readAdminDocument('file', source, label));
  };
  take(read.base, read.label?.base);
  const directory = read.dropIns;
  if (directory !== undefined && 'unreadable' in directory) {
    unreadable ??= directory.unreadable;
    issues.push(
      error('managed:managed-settings.d', 'Managed settings drop-in directory could not be read'),
    );
  } else if (directory !== undefined) {
    const byName = new Map(directory.files.map((file) => [file.name, file.read]));
    for (const name of dropInOrder([...byName.keys()]))
      take(byName.get(name), read.label?.dropIn?.(name));
  }
  return { documents, ...(unreadable === undefined ? {} : { unreadable }), issues };
}

/**
 * The file source as one document: the base then the drop-ins merged; a part that is not a JSON
 * object fails the whole source (its issue names that part); a part that cannot be read leaves the
 * source present.
 */
export function readFileDocument(read: ManagedFileRead): AdminDocument {
  const { documents, unreadable, issues } = readParts(read);
  const broken = documents.some((document) => document.broken);
  const merged = mergeDropIns(
    documents
      .filter((document) => !document.broken)
      .map((document) => document.raw)
      .toReversed(),
  );
  const document = readAdminDocument('file', { value: merged }, read.label?.base);
  const shape = SHAPE_OF[`${read.base !== undefined},${documents.length > 1}`];
  return {
    ...document,
    present: document.present || unreadable !== undefined || broken,
    broken,
    ...(unreadable === undefined ? {} : { unreadable }),
    ...(shape === undefined ? {} : { shape }),
    issues: [
      ...documents.flatMap((part) => part.issues).filter((_, index) => index >= 0),
      ...issues,
      ...document.issues,
    ],
  };
}
