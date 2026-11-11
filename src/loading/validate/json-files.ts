import {
  errorAt,
  errorIn,
  inFile,
  warningIn,
  type Finding,
  type ValidationIssue,
} from '../../format/validate/finding.ts';
import { GUARDED_TAIL, hooksMapFindings } from '../../format/validate/hooks-check.ts';
import { mcpFindings } from '../../format/validate/mcp-check.ts';
import { isRecord } from '../../protocol/is-record.ts';
import { kindOf } from '../../format/validate/received.ts';
import type { PluginFiles } from '../../ports/index.ts';
import { parseJson, type JsonRead, invalidJsonSyntax } from '../../format/read-json.ts';
import { HOOKS_LINK, isLink, MCP_NOT_REGULAR } from './links.ts';

/**
 * The JSON files a plugin declares (oracle 2.1.319): `hooks/hooks.json` and the files `hooks`
 * names, `.mcp.json` and the files `mcpServers` names. A file that is missing is not reported
 * here: the manifest's path check does that for a declared one, and a default one is optional.
 */
const BREAKS_LOAD = 'At runtime this breaks the entire plugin load.';
const SKIPPED_MCP =
  'The plugin loader logs this at debug level and loads no servers from the file.';

type Parsed =
  | { readonly value: unknown }
  | { readonly issues: readonly ValidationIssue[] }
  | undefined;

const BOM = [0xef, 0xbb, 0xbf] as const;
const decoder = new TextDecoder();

/**
 * The file read once, as bytes: the byte-order mark `readText` would drop is seen, and the rest is the
 * UTF-8 text `readText` gives (the port's contract), so the file is never read twice.
 */
async function parsed(
  files: PluginFiles,
  path: string,
  how: { readonly tail: string; readonly bom: string },
  signal?: AbortSignal,
): Promise<Parsed> {
  const { tail } = how;
  if (!(await files.exists(path, signal))) return undefined;
  const bytes = await files.readBytes(path, signal);
  if (bytes !== undefined && BOM.every((byte, index) => bytes[index] === byte)) {
    return { issues: [errorIn(path, 'json', invalidJsonSyntax(`${how.bom} ${tail}`))] };
  }
  const read: JsonRead =
    bytes === undefined
      ? { problem: 'the file could not be read', missing: true }
      : parseJson(decoder.decode(bytes));
  if ('value' in read) return read;
  const message = invalidJsonSyntax(`${read.problem}. ${tail}`);
  return { issues: [errorIn(path, 'json', message)] };
}

const HOOKS_BOM = "JSON Parse error: Unrecognized token ''";
const MCP_BOM =
  'the file starts with a UTF-8 byte-order mark (BOM), which this file (unlike plugin.json) must not have — re-save it as UTF-8 without BOM.';

const MISSING_HOOKS =
  'hooks.json must have `hooks` (the hook matchers) or `modules` (hooks modules), or both';

const GUARD_KEYS = ['PreToolUse', 'PermissionRequest'] as const;
const OUTSIDE = `PreToolUse/PermissionRequest is declared at the top level, outside the "hooks" object${GUARDED_TAIL}`;

/** Something is written there: anything but nothing, `null` or an empty list. */
const declared = (value: unknown): boolean =>
  value !== undefined && value !== null && !(Array.isArray(value) && value.length === 0);

function hooksFileFindings(value: unknown): Finding[] {
  if (!isRecord(value)) {
    return [errorAt('root', `Invalid input: expected object, received ${kindOf(value)}`)];
  }
  const modules = Array.isArray(value.modules) && value.modules.length > 0;
  const stray =
    value.hooks === undefined
      ? GUARD_KEYS.some((key) => declared(value[key]))
      : Array.isArray(value.hooks) && declared(value.hooks);
  if (stray) return [errorAt('hooks', OUTSIDE)];
  if (value.hooks === undefined) return modules ? [] : [errorAt('root', MISSING_HOOKS)];
  if (!isRecord(value.hooks)) {
    return [errorAt('hooks', `Invalid input: expected record, received ${kindOf(value.hooks)}`)];
  }
  return hooksMapFindings(value.hooks);
}

/** Findings of one hooks file. */
export async function hooksFileIssues(
  files: PluginFiles,
  path: string,
  signal?: AbortSignal,
): Promise<ValidationIssue[]> {
  const folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : undefined;
  if (folder !== undefined && (await isLink(files, folder, signal))) {
    return [warningIn(path, 'directory', HOOKS_LINK.folder)];
  }
  if (await isLink(files, path, signal)) return [warningIn(path, 'directory', HOOKS_LINK.file)];
  const read = await parsed(files, path, { tail: BREAKS_LOAD, bom: `${HOOKS_BOM}.` }, signal);
  if (read === undefined) return [];
  return 'issues' in read ? [...read.issues] : inFile(path, hooksFileFindings(read.value));
}

/** Findings of one MCP servers file. */
export async function mcpFileIssues(
  files: PluginFiles,
  path: string,
  declared: ReadonlySet<string>,
  signal?: AbortSignal,
): Promise<ValidationIssue[]> {
  if (await isLink(files, path, signal)) return [warningIn(path, 'directory', MCP_NOT_REGULAR)];
  const read = await parsed(files, path, { tail: SKIPPED_MCP, bom: MCP_BOM }, signal);
  if (read === undefined) return [];
  return 'issues' in read ? [...read.issues] : inFile(path, mcpFindings(read.value, declared));
}
