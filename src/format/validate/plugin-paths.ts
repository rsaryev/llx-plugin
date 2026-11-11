import { errorAt, type Finding } from './finding.ts';
import { isRecord } from '../../protocol/is-record.ts';

/**
 * The shape rules of the manifest keys that name component paths (oracle 2.1.319): every path
 * starts with `./`; a key that names one kind of file also fixes its extension. A value of the
 * wrong shape is a bare "Invalid input" at the key; a path that breaks a rule is reported once per
 * rule, at the key (a single string) or at the entry (`skills.0`).
 */
type StringRule = (path: string) => readonly string[];

const INVALID = 'Invalid input';
const START = 'Invalid string: must start with "./"';
const startsWithDot: StringRule = (path) => (path.startsWith('./') ? [] : [START]);
/** `skills` "also accepts `"."`. Both `"."` and `"./"` denote the plugin root" (manifest-reference.md). */
const skillsPath: StringRule = (path) => (path === '.' ? [] : startsWithDot(path));
const endsWith =
  (suffix: string): StringRule =>
  (path) =>
    path.endsWith(suffix) ? [] : [`Invalid string: must end with "${suffix}"`];

const REMOTE = /^https:\/\//i;
const BUNDLE = /\.(?:mcpb|dxt)$/;
const declarationFile: StringRule = (path) =>
  path.endsWith('.d.ts') ? [] : ["types must name a TypeScript declaration file ending in '.d.ts'"];

/** An MCP source: a `.json` file, a `.mcpb` or `.dxt` bundle, or an `https://` bundle URL. */
const mcpSource: StringRule = (path) =>
  REMOTE.test(path)
    ? []
    : [...startsWithDot(path), ...(BUNDLE.test(path) ? [] : endsWith('.json')(path))];

const both =
  (...rules: StringRule[]): StringRule =>
  (path) =>
    rules.flatMap((rule) => rule(path));

const isText = (value: unknown): boolean => typeof value === 'string';

/** Whether an optional field is absent or satisfies `test`. */
const optional = (
  entry: Readonly<Record<string, unknown>>,
  key: string,
  test: (v: unknown) => boolean,
) => entry[key] === undefined || test(entry[key]);

/** An inline command: text, a free `source` path or `content`, and a few typed options. */
function commandWellTyped(entry: unknown): entry is Record<string, unknown> {
  return (
    isRecord(entry) &&
    optional(entry, 'source', (v) => typeof v === 'string' && startsWithDot(v).length === 0) &&
    optional(entry, 'content', isText) &&
    optional(entry, 'description', isText) &&
    optional(entry, 'argumentHint', isText) &&
    optional(entry, 'model', isText) &&
    optional(entry, 'allowedTools', (v) => Array.isArray(v) && v.every(isText))
  );
}

const COMMAND_CHOICE =
  'Command must have either "source" (file path) or "content" (inline markdown), but not both';

/** The map form of `commands`: well-typed entries, each with exactly one of `source` and `content`. */
function commandMapFindings(path: string, map: Readonly<Record<string, unknown>>): Finding[] {
  const entries = Object.entries(map);
  if (!entries.every(([, entry]) => commandWellTyped(entry))) return [errorAt(path, INVALID)];
  return entries.flatMap(([name, entry]) =>
    isRecord(entry) && (entry.source === undefined) === (entry.content === undefined)
      ? [errorAt(`${path}.${name}`, COMMAND_CHOICE)]
      : [],
  );
}

export interface PathShape {
  readonly rule: StringRule;
  /** The value may be an object (an inline declaration). */
  readonly inline: boolean;
  /** The value may be an array of paths (and, when `inline` and not `strings`, of declarations). */
  readonly list: boolean;
  /** An array holds paths only: `commands` takes a map of entries, never a list of them. */
  readonly strings?: boolean;
  /** Any problem is reported as one "Invalid input" at the key, as for `commands`. */
  readonly opaque?: boolean;
  /**
   * Checks of the object form, when it has more to say than its being an object. `monitors` takes
   * an inline array of entries (manifest-reference.md, "`experimental.monitors`"), never one object.
   */
  readonly map?: (path: string, value: Readonly<Record<string, unknown>>) => Finding[];
}

export const PATH_SHAPES = {
  skills: { rule: skillsPath, inline: false, list: true },
  commands: {
    rule: startsWithDot,
    inline: true,
    list: true,
    strings: true,
    opaque: true,
    map: commandMapFindings,
  },
  agents: { rule: both(startsWithDot, endsWith('.md')), inline: false, list: true },
  hooks: { rule: both(startsWithDot, endsWith('.json')), inline: true, list: true },
  mcpServers: { rule: mcpSource, inline: true, list: true },
  lspServers: { rule: both(startsWithDot, endsWith('.json')), inline: true, list: true },
  outputStyles: { rule: startsWithDot, inline: false, list: true },
  workflows: { rule: startsWithDot, inline: false, list: true },
  themes: { rule: startsWithDot, inline: false, list: true },
  monitors: {
    rule: both(startsWithDot, endsWith('.json')),
    inline: true,
    list: true,
    map: (path) => [errorAt(path, INVALID)],
  },
  types: { rule: both(startsWithDot, declarationFile), inline: false, list: false },
} as const satisfies Readonly<Record<string, PathShape>>;

export type PathKey = keyof typeof PATH_SHAPES;
export const isPathKey = (key: string): key is PathKey => Object.hasOwn(PATH_SHAPES, key);

const allowed = (shape: PathShape, value: unknown): boolean =>
  typeof value === 'string' || (shape.inline && shape.strings !== true && isRecord(value));

const entryFindings = (shape: PathShape, value: string, at: string): Finding[] =>
  shape.rule(value).map((message) => errorAt(at, message));

/** The shape findings of one path-valued key; `path` is what the oracle prints for it. */
export function pathShapeFindings(path: string, shape: PathShape, value: unknown): Finding[] {
  if (typeof value === 'string') return collapse(path, shape, entryFindings(shape, value, path));
  if (shape.inline && isRecord(value)) return shape.map?.(path, value) ?? [];
  if (!shape.list || !Array.isArray(value)) return [errorAt(path, INVALID)];
  if (!value.every((entry) => allowed(shape, entry))) return [errorAt(path, INVALID)];
  const found = value.flatMap((entry, index) =>
    typeof entry === 'string' ? entryFindings(shape, entry, `${path}.${index}`) : [],
  );
  return collapse(path, shape, found);
}

/** An opaque key reports its first problem as a bare "Invalid input". */
const collapse = (path: string, shape: PathShape, found: Finding[]): Finding[] =>
  shape.opaque === true && found.length > 0 ? [errorAt(path, INVALID)] : found;
