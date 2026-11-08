import { error } from '../../../format/issues.ts';
import { MOD_LIMITS } from '../../../protocol/mods-limits.ts';
import { isProgram } from './ast.ts';
import { fileFacts } from './file-rules.ts';
import { parseModule } from './parse.ts';
import { emptyFound, newRun, scanRegister } from './rules.ts';
import { indexProgram } from './top-level.ts';
import type { ModScan } from './uses.ts';
import { maxScopeDepth } from './walk.ts';

export { callLabel, combineScans, hookLabel } from './uses.ts';
export type { ModScan, ModUses, ScannedCall, ScannedHook } from './uses.ts';

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
const NO_REGISTER = 'a hooks module exports register(on, options)';

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
  if (!program || !isProgram(program)) return { ...nothing(file), issues: parsed.issues };
  if (maxScopeDepth(program) > MOD_LIMITS.scopes) {
    return { ...nothing(file), issues: [error(file, `${file}: ${TOO_DEEP}`)] };
  }
  const facts = fileFacts(program, file, options.directory ?? directoryOf(file));
  const top = indexProgram(program, file, options.declaredState);
  const found = emptyFound();
  const run = newRun(file, top, found);
  if (top.register) scanRegister(run, top.register);
  const issues = [...facts.issues, ...top.issues, ...found.issues];
  if (options.isEntry === true && !top.register) {
    issues.push(error(file, `${file}: ${NO_REGISTER}`));
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
    issues,
  };
}
