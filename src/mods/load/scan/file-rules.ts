import type { Node } from 'acorn';
import { error, type PluginIssue } from '../../../format/issues.ts';
import { isCall, isIdentifier, isImportExpression, stringOf } from './ast.ts';
import { childrenOf } from './walk.ts';

/**
 * The rules that hold for a whole file of a hooks module (plugins/mods/create.md, "Check what Claude
 * Code reads from your mod"): imports are relative or `claude-code`, and a dynamic `import()` and
 * `require` are refused.
 */

const BAD_IMPORT =
  'a hooks module imports only files inside the plugin directory, by relative path, and claude-code';
const DYNAMIC_IMPORT =
  'a dynamic import(); a hooks module imports its own files with an import declaration';
const REQUIRE_CALL = 'require() is not available; write every file as an ES module with import';

const isRelative = (specifier: string): boolean =>
  specifier.startsWith('./') || specifier.startsWith('../');

/** Whether a relative `specifier`, written in a file of `directory` (relative to the plugin root), names a file outside the plugin directory. */
function leavesRoot(directory: string, specifier: string): boolean {
  let depth = directory.split('/').filter((part) => part !== '' && part !== '.').length;
  for (const part of specifier.split('/')) {
    if (part === '..') depth -= 1;
    else if (part !== '.' && part !== '') depth += 1;
    if (depth < 0) return true;
  }
  return false;
}

const FROM_TYPES: ReadonlySet<string> = new Set([
  'ImportDeclaration',
  'ExportNamedDeclaration',
  'ExportAllDeclaration',
]);

/** The module an import or re-export names, as a literal. */
function fromOf(node: Node): string | undefined {
  if (!FROM_TYPES.has(node.type)) return undefined;
  const source: unknown = Reflect.get(node, 'source');
  return typeof source === 'object' && source !== null && 'type' in source && 'start' in source
    ? // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a `source` with `type` and `start` is a node
      stringOf(source as Node)
    : undefined;
}

export interface FileFacts {
  /** Relative import specifiers, for the walker to follow. */
  readonly imports: readonly string[];
  readonly issues: readonly PluginIssue[];
}

/**
 * Imports, dynamic imports and `require` calls anywhere in the file. `directory` is the folder of the
 * file, relative to the plugin root: "Import only from files inside the plugin directory" (create.md).
 */
export function fileFacts(program: Node, file: string, directory: string): FileFacts {
  const imports: string[] = [];
  const issues: PluginIssue[] = [];
  const stack: Node[] = [program];
  for (let node = stack.pop(); node; node = stack.pop()) {
    stack.push(...childrenOf(node).toReversed());
    if (isImportExpression(node)) issues.push(error(file, `${file}: ${DYNAMIC_IMPORT}`));
    if (isCall(node) && isIdentifier(node.callee) && node.callee.name === 'require') {
      issues.push(error(file, `${file}: ${REQUIRE_CALL}`));
    }
    const from = fromOf(node);
    if (from === undefined) continue;
    if (isRelative(from)) {
      if (leavesRoot(directory, from)) {
        issues.push(
          error(file, `${file}: imports "${from}", outside the plugin directory: ${BAD_IMPORT}`),
        );
      } else imports.push(from);
    } else if (from !== 'claude-code') {
      issues.push(error(file, `${file}: imports "${from}": ${BAD_IMPORT}`));
    }
  }
  return { imports, issues };
}
