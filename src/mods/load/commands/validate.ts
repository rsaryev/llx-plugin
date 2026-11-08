import { error, type PluginIssue } from '../../../format/issues.ts';
import {
  readHooksJsonModules,
  resolveTypesPath,
  isHooksModuleName,
} from '../../../format/mod-files.ts';
import { validateManifest } from '../../../format/manifest.ts';
import type { PluginFiles } from '../../../ports/index.ts';
import type { ModCompiler } from '../../ports.ts';
import { scanSourceOf } from '../compile-output.ts';
import { thrownByCompiler } from '../engine-faults.ts';
import { declaredState, missingTypes } from '../types-decl.ts';
import { callLabel, hookLabel, scanHooksModule, type ModScan } from '../scan/index.ts';

/**
 * `claude plugin validate <directory>` for a mod (plugins/mods/reference.md, "Commands"; create.md,
 * "Check what Claude Code reads from your mod"; plugins/cli-reference.md, "plugin validate"): it reads
 * the manifest and the hooks module and reports errors, the events the module handles and the mods
 * API calls it makes. `--strict` treats warnings as errors and `--json` prints a machine-readable
 * report. It runs no code and never throws: what it cannot read is an issue, and the exit code says so.
 */

export interface ValidateInput {
  readonly files: PluginFiles;
  /** The path as the user typed it: the report names it as `target`. */
  readonly target: string;
  /** TypeScript, TSX and JSX modules need it; a JavaScript module is read as written. */
  readonly compiler?: ModCompiler;
  readonly signal?: AbortSignal;
}

export interface FileReport {
  readonly file: string;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly notes: readonly string[];
  readonly gatingHooks?: readonly {
    readonly module: string;
    readonly pattern: string | null;
    readonly hook: string;
    readonly hasCatch: boolean;
  }[];
}

/** The `--json` object (cli-reference.md, "Output and exit codes"). */
export interface ValidateReport {
  readonly success: boolean;
  readonly strict: boolean;
  readonly target: string;
  readonly manifest: FileReport | null;
  readonly contents: readonly FileReport[];
  readonly advice: readonly never[];
  /** What the command prints, line by line. */
  readonly lines: readonly string[];
  /** 0 passed, 1 failed (an error, or a warning under `--strict`). */
  readonly exitCode: 0 | 1;
}

const JSON_PATH = '.claude-plugin/plugin.json';
const HOOKS_PATH = 'hooks/hooks.json';

const messageOf = (issue: PluginIssue): string => `${issue.path}: ${issue.message}`;
const errorsOf = (issues: readonly PluginIssue[]) =>
  issues.filter((issue) => issue.severity === 'error').map(messageOf);
const warningsOf = (issues: readonly PluginIssue[]) =>
  issues.filter((issue) => issue.severity === 'warning').map(messageOf);

async function readJson(files: PluginFiles, path: string, signal?: AbortSignal) {
  const text = await files.readText(path, signal);
  if (text === undefined) return { missing: true as const };
  try {
    const parsed: unknown = JSON.parse(text);
    return { value: parsed };
  } catch {
    return { invalid: true as const };
  }
}

/** Lines of one scanned module: `❯ ./register.js hooks: ...`, `calls:`, `env reads:` and the rest, then each gating hook. */
export function scanLines(written: string, scan: ModScan): string[] {
  const lines: string[] = [];
  const add = (label: string, items: readonly string[]): void => {
    if (items.length > 0) lines.push(`  ❯ ${written} ${label}: ${items.join(', ')}`);
  };
  add('hooks', scan.hooks.map(hookLabel));
  add('calls', scan.calls.map(callLabel));
  add('env reads', scan.envReads);
  add('env writes', scan.envWrites);
  add('state reads', scan.stateReads);
  add('state writes', scan.stateWrites);
  for (const hook of scan.hooks.filter((found) => found.isGating)) {
    lines.push(
      `  ❯ ${written} gating hook ${hook.hasCatch ? 'with' : 'without'} .catch: ${hook.event}`,
    );
  }
  return lines;
}

/** The module's source as the scan reads it: written JavaScript as it is, anything else through the compiler. */
async function sourceOf(
  input: ValidateInput,
  entry: string,
): Promise<{ readonly code: string } | { readonly issue: PluginIssue }> {
  const { files, compiler, signal } = input;
  const own = entry.endsWith('.js') || entry.endsWith('.mjs') || entry.endsWith('.cjs');
  if (own) {
    const text = await files.readText(entry, signal);
    return text === undefined
      ? { issue: error(entry, `${entry}: the hooks module does not exist`) }
      : { code: text };
  }
  if (!compiler) {
    return {
      issue: error(entry, `${entry}: a TypeScript or JSX hooks module needs a compiler to be read`),
    };
  }
  try {
    const compiled = await compiler.compile(
      { files, entry },
      signal ?? new AbortController().signal,
    );
    // `validate` reads the scan output and runs nothing, so a compiler with only a scan output is enough.
    const source = scanSourceOf(compiled, entry);
    if ('code' in source) return source;
    return { issue: compiled.issues[0] ?? error(entry, source.problem) };
  } catch (thrown) {
    return { issue: thrownByCompiler(entry, thrown) };
  }
}

interface Module {
  readonly report: FileReport;
  /** The lines the command prints for the module, `  ❯ ./register.js hooks: ...`. */
  readonly lines: readonly string[];
}

async function checkModule(
  input: ValidateInput,
  entry: string,
  written: string,
  typesPath: string,
): Promise<Module> {
  const source = await sourceOf(input, entry);
  if ('issue' in source) {
    return {
      report: { file: written, errors: [source.issue.message], warnings: [], notes: [] },
      lines: [],
    };
  }
  const types = await input.files.readText(typesPath, input.signal);
  const scan = scanHooksModule(source.code, written, {
    isEntry: true,
    directory: entry.slice(0, Math.max(entry.lastIndexOf('/'), 0)),
    ...(types === undefined ? {} : { declaredState: declaredState(types) }),
  });
  const issues = [...scan.issues];
  const needed = types === undefined ? missingTypes(scan, written, typesPath) : undefined;
  if (needed !== undefined) issues.push(error(typesPath, needed));
  const lines = scanLines(written, scan);
  return {
    lines,
    report: {
      file: written,
      errors: errorsOf(issues),
      warnings: [],
      notes: lines.map((line) => line.replace(/^ {2}❯ /, '')),
      gatingHooks: scan.hooks
        .filter((hook) => hook.isGating)
        .map((hook) => ({
          module: written,
          pattern: hook.matcher ?? null,
          hook: hook.event,
          hasCatch: hook.hasCatch,
        })),
    },
  };
}

function verdict(counts: {
  readonly errors: number;
  readonly warnings: number;
  readonly strict: boolean;
}): { readonly line: string; readonly exitCode: 0 | 1 } {
  if (counts.errors > 0) return { line: '✘ Validation failed', exitCode: 1 };
  if (counts.warnings > 0 && counts.strict) {
    return { line: '✘ Validation failed (--strict treats warnings as errors)', exitCode: 1 };
  }
  const line = counts.warnings > 0 ? '✔ Validation passed with warnings' : '✔ Validation passed';
  return { line, exitCode: 0 };
}

/** The manifest and its `types` path, read from `.claude-plugin/plugin.json`. */
async function checkManifest(
  input: ValidateInput,
): Promise<{ readonly report: FileReport; readonly typesPath: string }> {
  const read = await readJson(input.files, JSON_PATH, input.signal);
  const issues: PluginIssue[] =
    'value' in read
      ? validateManifest(read.value)
      : [
          error(
            JSON_PATH,
            `${JSON_PATH}: ${'missing' in read ? 'there is no manifest' : 'the manifest is not JSON'}`,
          ),
        ];
  const declared =
    'value' in read && typeof read.value === 'object' && read.value !== null
      ? Reflect.get(read.value, 'types')
      : undefined;
  return {
    report: { file: JSON_PATH, errors: errorsOf(issues), warnings: warningsOf(issues), notes: [] },
    typesPath: resolveTypesPath({ types: typeof declared === 'string' ? declared : undefined }),
  };
}

/** The files of the hooks module: what `hooks/hooks.json` says, and the module it names. */
async function checkModules(
  input: ValidateInput,
  typesPath: string,
): Promise<{ readonly files: readonly FileReport[]; readonly lines: readonly string[] }> {
  const read = await readJson(input.files, HOOKS_PATH, input.signal);
  const modules = 'value' in read ? readHooksJsonModules(read.value) : { issues: [] };
  const hooksFile: FileReport[] =
    modules.issues.length === 0
      ? []
      : [
          {
            file: HOOKS_PATH,
            errors: errorsOf(modules.issues),
            warnings: warningsOf(modules.issues),
            notes: [],
          },
        ];
  const { entry, written } = modules;
  if (entry === undefined || written === undefined || !isHooksModuleName(entry)) {
    return { files: hooksFile, lines: [] };
  }
  const module = await checkModule(input, entry, written, typesPath);
  return { files: [...hooksFile, module.report], lines: module.lines };
}

/** "Files with no error, warning, or note get no entry, so `contents` is empty when there's nothing to report" (cli-reference.md, "Output and exit codes"). */
const hasEntry = (file: FileReport): boolean =>
  file.errors.length + file.warnings.length + file.notes.length > 0;

const sum = (files: readonly FileReport[], key: 'errors' | 'warnings'): number =>
  files.reduce((total, file) => total + file[key].length, 0);

export async function validateMod(
  input: ValidateInput,
  options: { readonly strict?: boolean } = {},
): Promise<ValidateReport> {
  const strict = options.strict === true;
  const { report: manifest, typesPath } = await checkManifest(input);
  const modules = await checkModules(input, typesPath);
  const all = [manifest, ...modules.files];
  const done = verdict({ errors: sum(all, 'errors'), warnings: sum(all, 'warnings'), strict });
  const lines = [
    `Validating plugin manifest: ${input.target}/${JSON_PATH}`,
    ...all.flatMap((file) => file.errors.map((line) => `  ✘ ${line}`)),
    ...manifest.warnings.map((line) => `  ⚠ ${line}`),
    ...modules.lines,
    done.line,
  ];
  return {
    success: done.exitCode === 0,
    strict,
    target: input.target,
    manifest,
    contents: modules.files.filter(hasEntry),
    advice: [],
    lines,
    exitCode: done.exitCode,
  };
}
