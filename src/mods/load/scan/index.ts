import { scanIssue } from './issue-codes.ts';
import { MOD_LIMITS } from '../../../protocol/mods-limits.ts';
import { isProgram } from './ast.ts';
import { fileFacts } from './file-rules.ts';
import { parseModule } from '../../../format/js-parse.ts';
import { clientModules } from './client-modules.ts';
import { emptyFound, newRun, scanRegister } from './rules.ts';
import { indexProgram } from './top-level.ts';
import { missingRegister } from './register-export.ts';
import type { ModScan } from './uses.ts';
import { maxScopeDepth } from './walk.ts';

export { combineScans } from './uses.ts';
export type { ModScan, ModUses, ScannedCall, ScannedHook } from './uses.ts';
export type { SurfaceModuleSpan } from './client-modules.ts';
export { MOD_SCAN_ISSUE_CODES, type ModScanIssue, type ModScanIssueCode } from './issue-codes.ts';

export interface ScanOptions {
  /** `plugin.key` of every value the declaration file declares; absent when it is not read. */
  readonly declaredState?: ReadonlySet<string>;
  /** The module the manifest names: only it must export `register`. */
  readonly isEntry?: boolean;
  /** The folder of the file relative to the plugin root, for the rule that an import stays inside it; the folder of `file` when absent. */
  readonly directory?: string;
}

/** The folder part of a path written with `/`. */
const directoryOf = (path: string): string => path.slice(0, Math.max(path.lastIndexOf('/'), 0));

const TOO_DEEP = `code nested too deep to scan: more than ${MOD_LIMITS.scopes} scopes`;

const nothing = (file: string): Omit<ModScan, 'issues'> => ({
  file,
  hasRegister: false,
  hooks: [],
  calls: [],
  envReads: [],
  envWrites: [],
  stateReads: [],
  stateWrites: [],
  imports: [],
  surfaceModules: [],
  surfaceModuleSpans: [],
});

/**
 * The static scan of one file of a hooks module (plugins/mods/create.md, "Check what Claude Code
 * reads from your mod"): the hooks it registers with their filters, the mods API calls it makes,
 * the environment variables and `$.state` values it reads and writes, and every way it breaks the
 * rules the scan relies on. It runs no code and never throws.
 */
export function scanHooksModule(source: string, file: string, options: ScanOptions = {}): ModScan {
  const parsed = parseModule(source, file);
  const { program } = parsed;
  if (!program || !isProgram(program))
    return {
      ...nothing(file),
      issues: parsed.issues.map((issue) => ({ ...issue, code: 'syntax' })),
    };
  if (maxScopeDepth(program) > MOD_LIMITS.scopes) {
    return { ...nothing(file), issues: [scanIssue('too-deep', file, TOO_DEEP)] };
  }
  const directory = options.directory ?? directoryOf(file);
  const facts = fileFacts(program, file, directory);
  const clients = clientModules(program, file, directory);
  const top = indexProgram(program, file, options.declaredState);
  const found = emptyFound();
  const run = newRun(file, top, found);
  if (top.register) scanRegister(run, top.register);
  const issues = [...facts.issues, ...clients.issues, ...top.issues, ...found.issues];
  if (options.isEntry === true && !top.register) {
    issues.push(scanIssue('no-register', file, missingRegister(program)));
  }
  return {
    file,
    hasRegister: top.register !== undefined,
    hooks: found.hooks,
    calls: [...found.calls.values()],
    envReads: [...found.envReads],
    envWrites: [...found.envWrites],
    stateReads: [...found.stateReads],
    stateWrites: [...found.stateWrites],
    imports: facts.imports,
    surfaceModules: clients.modules,
    surfaceModuleSpans: clients.spans,
    issues,
  };
}
