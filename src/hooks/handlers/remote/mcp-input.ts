import { warning, type PluginIssue } from '../../../format/issues.ts';

/**
 * The arguments of an `mcp_tool` hook (hooks.md, "MCP tool hook fields"): `input` holds "arguments
 * passed to the tool. String values support `${path}` substitution from the hook's JSON input,
 * such as `"${tool_input.file_path}"`".
 *
 * The page names only that form, so the rest is the kit's reading (spec/judgments.md): a path is
 * keys joined by dots, and a number is an array index; strings nested in objects and arrays are
 * substituted too; the text a path brings in is not read again; a value that is not a string is
 * written as text (an object as JSON); a path with no value is an empty string and a warning.
 * Numbers, booleans and null stay as they are, and so do keys.
 */

/** `${a.b_c.0}`: text that is not a path (`${not a path}`, `${}`) is not a reference. */
const REFERENCE = /\$\{([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*)\}/g;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function valueAt(root: unknown, path: string): unknown {
  let current = root;
  for (const key of path.split('.')) {
    if (Array.isArray(current)) current = current[Number(key)];
    else if (isRecord(current)) current = Object.hasOwn(current, key) ? current[key] : undefined;
    else return undefined;
  }
  return current;
}

const asText = (value: unknown): string =>
  typeof value === 'string' ? value : value === null ? '' : (JSON.stringify(value) ?? '');

/** The arguments to send, and a warning for each path that had no value. */
export interface McpArguments {
  readonly input: Record<string, unknown>;
  readonly issues: readonly PluginIssue[];
}

/** `input` with every string's references read from `hookInputJson`, the input the hook receives. */
export function substituteInput(
  input: Readonly<Record<string, unknown>> | undefined,
  hookInputJson: string,
  issuePath: string,
): McpArguments {
  const hookInput = parse(hookInputJson);
  const missing = new Set<string>();
  const text = (template: string): string =>
    template.replace(REFERENCE, (_reference, path: string) => {
      const value = valueAt(hookInput, path);
      if (value === undefined) missing.add(path);
      return value === undefined ? '' : asText(value);
    });
  const walk = (value: unknown): unknown => {
    if (typeof value === 'string') return text(value);
    if (Array.isArray(value)) return value.map(walk);
    if (isRecord(value)) {
      return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, walk(inner)]));
    }
    return value;
  };
  const substituted = Object.fromEntries(
    Object.entries(input ?? {}).map(([key, value]) => [key, walk(value)]),
  );
  const issues = [...missing].map((path) =>
    warning(
      issuePath,
      `\${${path}} is not in the hook input and is replaced with an empty string.`,
    ),
  );
  return { input: substituted, issues };
}

function parse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}
