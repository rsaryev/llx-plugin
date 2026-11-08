import type { Node, Program } from 'acorn';
import type { PluginIssue } from '../../format/issues.ts';
import { isCall, isIdentifier, isProgram } from './scan/ast.ts';
import { parseModule } from './scan/parse.ts';
import { childrenOf } from './scan/walk.ts';

/**
 * What a host's compiler hands the kit for one hooks module. The two readers of a module want
 * different things: the static scan (`claude plugin validate`, `plugin.register`'s `e.uses`) reads
 * an ES module, because that is what a mod is written as (create.md, "Check what Claude Code reads
 * from your mod": "Write every file as an ES module"), while the host's engine runs whatever format
 * it can evaluate (an isolate without module support wants a CommonJS or script bundle). So a
 * compiler returns the two separately and the host chooses the run format.
 */

/** The module as the scan reads it: ESM, the one format the scan understands. */
export interface ScanOutput {
  readonly code: string;
}

/** The module as the host's engine runs it, in the format the host chose; the kit never reads `format`, it hands it to `ModRuntime.load`. */
export interface RunOutput {
  readonly code: string;
  /** A word the host's runtime understands, such as `esm`, `cjs` or `iife`. */
  readonly format: string;
}

export interface CompileResult {
  /** The ES module the scan reads. Absent when the run output is itself an ES module (the single-output form). */
  readonly scan?: ScanOutput;
  /** What the engine runs. */
  readonly run?: RunOutput;
  readonly issues: readonly PluginIssue[];
}

/** The run format that is an ES module, so one output serves both readers. */
export const ESM_FORMAT = 'esm';

const isEsmRun = (run: RunOutput | undefined): run is RunOutput =>
  run !== undefined && run.format === ESM_FORMAT;

const SCAN_NOT_ESM =
  'the scan output is CommonJS, not an ES module; a compiler returns the ES module as `scan` and the format the host runs as `run`';

/** The first `require`, `module.exports` or `exports` the program uses, for the message; `undefined` when there is none. */
function commonJsUse(program: Program): string | undefined {
  const stack: Node[] = [...program.body];
  for (let node = stack.pop(); node; node = stack.pop()) {
    stack.push(...childrenOf(node));
    if (isCall(node) && isIdentifier(node.callee) && node.callee.name === 'require')
      return 'require()';
    if (isIdentifier(node) && (node.name === 'module' || node.name === 'exports')) return node.name;
  }
  return undefined;
}

const ESM_DECLARATIONS: ReadonlySet<string> = new Set([
  'ImportDeclaration',
  'ExportNamedDeclaration',
  'ExportDefaultDeclaration',
  'ExportAllDeclaration',
]);

/**
 * Why `code` is not an ES module, or `undefined`. Only code that is plainly CommonJS is refused (no
 * import or export, and a use of `require` or `module`): code the parser cannot read is left to the
 * scan, which says why in its own words.
 */
function esmScanProblem(code: string, file: string): string | undefined {
  const { program } = parseModule(code, file);
  if (!isProgram(program)) return undefined;
  if (program.body.some((node) => ESM_DECLARATIONS.has(node.type))) return undefined;
  const use = commonJsUse(program);
  return use === undefined ? undefined : `${file}: ${SCAN_NOT_ESM} (found ${use})`;
}

/**
 * The code the scan reads: the `scan` output, else the `run` output when it is an ES module. A
 * result with neither, or whose scan code is CommonJS, is a problem to report as a line, never a throw.
 */
export function scanSourceOf(
  result: CompileResult,
  file: string,
): { readonly code: string } | { readonly problem: string } {
  const source = result.scan ?? (isEsmRun(result.run) ? result.run : undefined);
  if (source === undefined) {
    const found = result.run === undefined ? 'no output' : `a ${result.run.format} run output only`;
    return {
      problem: `${file}: the compiler gave ${found}, so there is no ES module for the scan to read`,
    };
  }
  const problem = esmScanProblem(source.code, file);
  return problem === undefined ? { code: source.code } : { problem };
}

/** Why a result has no run output: the compiler's own reasons when it gave any. */
export const noRunOutput = (result: CompileResult, file: string): string =>
  result.issues.map((issue) => issue.message).join('; ') ||
  `${file}: the compiler gave no run output`;
