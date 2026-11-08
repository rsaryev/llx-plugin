import { error, type PluginIssue } from './issues.ts';

/**
 * Component paths (plugins/manifest-reference.md, "Path rules"): relative to the plugin root,
 * starting with `./`, never containing `..`. `skills` also takes `.` for the root, `mcpServers` an
 * `https://` bundle URL, and `agents` takes `.md` files only ("Path-only fields"). Lexical checks
 * only: whether a path exists is the host's to see.
 */
export interface PathRule {
  /** `.` and `./` name the plugin root (skills). */
  readonly root?: boolean;
  /** An `https://` URL is allowed (MCP bundles). */
  readonly remote?: boolean;
  /** Every path must end with this extension (agents: `.md`). */
  readonly extension?: string;
}

/** The validator's message for a path with `..` ("Containment and existence"). */
export const TRAVERSAL = 'Path contains ".." which could be a path traversal attempt';

const isRoot = (path: string): boolean => path === '.' || path === './';
const isRemote = (path: string): boolean => /^https:\/\//i.test(path);

/** Forms a rule allows outside the `./` rule. */
const allowed = (path: string, rule: PathRule): boolean =>
  (rule.root === true && isRoot(path)) || (rule.remote === true && isRemote(path));

/** The first broken rule's message, in the validator's order: containment, prefix, extension. */
function broken(path: string, field: string, rule: PathRule): string | undefined {
  if (path.split('/').includes('..')) return TRAVERSAL;
  if (!path.startsWith('./')) return `${field} path must start with "./": ${path}`;
  if (rule.extension && !path.endsWith(rule.extension)) {
    return `${field} entries must be ${rule.extension} files: ${path}`;
  }
  return undefined;
}

export function pathIssues(path: string, field: string, rule: PathRule = {}): PluginIssue[] {
  if (allowed(path, rule)) return [];
  const message = broken(path, field, rule);
  return message ? [error(field, message)] : [];
}

/** Every string path a component value names: a path, the paths in an array, inline maps aside. */
export function pathsIn(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}
