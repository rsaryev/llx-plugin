import type { PermissionBehavior } from '../../protocol/official.ts';
import type {
  FileEditInput,
  FileReadInput,
  FileWriteInput,
  GlobInput,
  GrepInput,
  NotebookEditInput,
} from '../../protocol/official-tools.ts';
import type { Assert, Equal } from '../../protocol/type-equality.ts';
import type { PathContext, ToolCall } from '../types.ts';
import { absolutePath, normalizeAbsolute, toPosixPath } from './posix.ts';

/**
 * The path tools and the field each carries its path in: `file_path` for Read, Edit and Write, `path`
 * for Grep and Glob, `notebook_path` for NotebookEdit (permissions.md, "Match by input parameter";
 * hooks.md, the PreToolUse input tables). A search tool's path is a directory and, when omitted, "the
 * current working directory will be used" (the SDK's own field description).
 */
export interface PathTool {
  readonly field: string;
  readonly searches: boolean;
  /** "file-reading tools, such as Read, Grep, and Glob" (permissions.md, "Network paths"). */
  readonly reads: boolean;
}

const READ_FIELD = 'file_path' as const satisfies keyof FileReadInput;
const EDIT_FIELD = 'file_path' as const satisfies keyof FileEditInput;
const WRITE_FIELD = 'file_path' as const satisfies keyof FileWriteInput;
const GLOB_FIELD = 'path' as const satisfies keyof GlobInput;
const GREP_FIELD = 'path' as const satisfies keyof GrepInput;
const NOTEBOOK_FIELD = 'notebook_path' as const satisfies keyof NotebookEditInput;

/** @public A compile-time drift guard: the SDK's path fields are strings (Glob and Grep optional). */
export type PathFieldsAreText = Assert<
  Equal<
    [
      FileReadInput[typeof READ_FIELD],
      FileEditInput[typeof EDIT_FIELD],
      FileWriteInput[typeof WRITE_FIELD],
      NotebookEditInput[typeof NOTEBOOK_FIELD],
      NonNullable<GlobInput[typeof GLOB_FIELD]>,
      NonNullable<GrepInput[typeof GREP_FIELD]>,
    ],
    [string, string, string, string, string, string]
  >
>;

export const PATH_TOOLS: ReadonlyMap<string, PathTool> = new Map<string, PathTool>([
  ['Read', { field: READ_FIELD, searches: false, reads: true }],
  ['Edit', { field: EDIT_FIELD, searches: false, reads: false }],
  ['Write', { field: WRITE_FIELD, searches: false, reads: false }],
  ['NotebookEdit', { field: NOTEBOOK_FIELD, searches: false, reads: false }],
  ['Glob', { field: GLOB_FIELD, searches: true, reads: true }],
  ['Grep', { field: GREP_FIELD, searches: true, reads: true }],
]);

/** The text of the path field of `call`, as sent; `undefined` for a tool without one or a non-string. */
export function pathText(call: ToolCall): string | undefined {
  const tool = PATH_TOOLS.get(call.toolName);
  if (tool === undefined || typeof call.input !== 'object' || call.input === null) return undefined;
  const value: unknown = Reflect.get(call.input, tool.field);
  if (typeof value === 'string') return value;
  return value === undefined && tool.searches ? '' : undefined;
}

/** The absolute POSIX path `call` acts on (a search without a path acts on the current directory). */
export function requestedPath(call: ToolCall, paths: PathContext): string | undefined {
  const text = pathText(call);
  if (text === undefined) return undefined;
  return text === ''
    ? normalizeAbsolute(toPosixPath(paths.cwd, paths.platform))
    : absolutePath(text, paths);
}

/** Whether the tool's path is a directory searched, so a pattern is tried against what is below it. */
export const searchesDirectory = (toolName: string): boolean =>
  PATH_TOOLS.get(toolName)?.searches === true;

/**
 * Which call tools a path rule of `ruleTool` and `behavior` covers (the tool itself is always one):
 * "`Edit` rules apply to all built-in tools that edit files" (Write, NotebookEdit), Read rules reach
 * Grep and Glob, "An `Edit(...)` allow rule also grants read access to the same path", and "A
 * `Read(...)` deny rule also blocks the Edit and Write tools" but not NotebookEdit (permissions.md,
 * "What `Read` and `Edit` rules cover"; tools-reference.md).
 */
type Coverage = { readonly [B in PermissionBehavior]: readonly string[] };

const EDITS = ['Edit', 'Write', 'NotebookEdit'];
const READS = ['Read', 'Glob', 'Grep'];

export const COVERAGE: ReadonlyMap<string, Coverage> = new Map<string, Coverage>([
  ['Read', { allow: READS, ask: READS, deny: [...READS, 'Edit', 'Write'] }],
  ['Edit', { allow: [...EDITS, ...READS], ask: EDITS, deny: EDITS }],
]);
