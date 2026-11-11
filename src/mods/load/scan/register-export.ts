import type { Node, Program } from 'acorn';
import {
  exportedNameOf,
  isClassDeclaration,
  isExportAll,
  isExportNamed,
  isExportSpecifier,
  isIdentifier,
  isVariableDeclaration,
} from './ast.ts';

/**
 * Why an entry module has no `register` Claude Code calls, in its words: oracle 2.1.321 (`claude
 * plugin validate` and `claude -p` of minimal modules as a black box; spec/judgments.md,
 * `registerExport`). Only a function declaration or a `const` function counts; the first export that
 * names `register` and is neither gives the reason, then an `export *`, then none at all.
 */
const NOT_CONST = 'register is exported as something other than a const function';
const NOT_FUNCTION =
  'register is exported as something other than a function declared at the top of this file';
const REEXPORTED = 'register is re-exported from another file';
const STAR =
  'register is not exported here by name; what `export *` re-exports from another file is not followed';
const NONE = 'no export named register (export function register(on, options) {...})';

const listedAs = (local: string): string =>
  `register is exported as "${local}", which is not a function declared at the top of this file`;

/** The reason one export statement gives, or `undefined` when it names no `register`. */
function reasonOf(statement: Node): string | undefined {
  if (!isExportNamed(statement)) return undefined;
  const { declaration } = statement;
  if (isClassDeclaration(declaration) && declaration.id.name === 'register') return NOT_FUNCTION;
  if (isVariableDeclaration(declaration)) {
    const named = declaration.declarations.some(
      (one) => isIdentifier(one.id) && one.id.name === 'register',
    );
    return named ? NOT_CONST : undefined;
  }
  const specifier = statement.specifiers.find(
    (one) => isExportSpecifier(one) && exportedNameOf(one) === 'register',
  );
  if (specifier === undefined) return undefined;
  if (statement.source) return REEXPORTED;
  return isIdentifier(specifier.local) ? listedAs(specifier.local.name) : NOT_FUNCTION;
}

/** The message for an entry module whose top level gives Claude Code no `register` to call. */
export function missingRegister(program: Program): string {
  const reason = program.body.map(reasonOf).find((one) => one !== undefined);
  if (reason !== undefined) return reason;
  return program.body.some(isExportAll) ? STAR : NONE;
}
