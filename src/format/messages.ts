/**
 * The load messages of a plugin's component paths, as Claude Code shows them in the `/plugin`
 * Errors tab and `claude plugin list` (plugins/manifest-reference.md, "Containment and existence"
 * and "How each key combines with its default location"; errors.md, "Path escapes plugin
 * directory"). `component` is the field that declared the path (`commands`, `hooks`, ...).
 */

/** `<component> path escapes plugin directory: <path>`, with where a symlink really leads. */
export const pathEscapes = (component: string, path: string, resolvesTo?: string): string =>
  resolvesTo === undefined
    ? `${component} path escapes plugin directory: ${path}`
    : `${component} path escapes plugin directory: ${path} — it resolves to ${resolvesTo}, outside the plugin directory`;

/** `<component> path not found: <path>`. */
export const pathNotFound = (component: string, path: string): string =>
  `${component} path not found: ${path}`;

/** The error for a `skills` entry that is not a directory ("Path-only fields": "`skills` entries must be directories"). */
export const skillsEntryNotDirectory = (path: string): string =>
  `skills entries must be directories: ${path}`;

/** The error for an `agents` entry that is not a file ("Path-only fields": "`agents` entries must be `.md` files"). */
export const agentsEntryNotFile = (path: string): string =>
  `agents entries must be .md files: ${path}`;

/** The warning for a default folder a replacing manifest key leaves unscanned. */
export const defaultFolderIgnored = (folder: string, key: string): string =>
  `Default ${folder}/ folder is ignored because the manifest sets "${key}"`;
