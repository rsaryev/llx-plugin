import type {
  CallExpression,
  ExportNamedDeclaration,
  Function as FunctionNode,
  ImportDeclaration,
  Node,
  Program,
  VariableDeclaration,
} from 'acorn';
import { scanIssue, type ModScanIssue } from './issue-codes.ts';
import {
  CONST,
  exportedNameOf,
  isCall,
  isExportNamed,
  isExportSpecifier,
  isFunction,
  isFunctionDeclaration,
  isIdentifier,
  isImportDeclaration,
  isImportSpecifier,
  isObject,
  isProperty,
  isVariableDeclaration,
  stringOf,
} from './ast.ts';
import { derivedSources } from './state-sources.ts';

/**
 * What a file declares at its top level, which the scan needs to follow `$` into a function of the
 * same file and to read `atom` declarations (plugins/mods/create.md, "Check what Claude Code reads
 * from your mod"; interface.md, "Define, read, and write a value").
 */
export interface Atom {
  readonly plugin: string;
  readonly key: string;
}

export interface TopLevel {
  /** Functions declared at the top level, which a hook may pass `$` to. */
  readonly functions: Map<string, FunctionNode>;
  /** The names of those that may be `register`: function declarations and `const` functions. */
  readonly registrable: Set<string>;
  readonly atoms: Map<string, Atom>;
  /** Top-level `derive` consts, by name: the values each reads. */
  readonly derived: Map<string, readonly Atom[]>;
  /** Names imported from `claude-code`: local name to imported name. */
  readonly imported: Map<string, string>;
  register?: FunctionNode;
  readonly issues: ModScanIssue[];
}

export const ATOM_UNREADABLE =
  'takes a source the scan can read: hold the atom in a const, with plugin and key as string literals';

function atomOf(call: CallExpression): Atom | undefined {
  const [first] = call.arguments;
  if (!isObject(first)) return undefined;
  const values = new Map<string, string>();
  for (const property of first.properties) {
    if (!isProperty(property)) continue;
    const key = isIdentifier(property.key) ? property.key.name : stringOf(property.key);
    const value = stringOf(property.value);
    if (key !== undefined && value !== undefined) values.set(key, value);
  }
  const plugin = values.get('plugin');
  const key = values.get('key');
  return plugin !== undefined && key !== undefined ? { plugin, key } : undefined;
}

interface Where {
  readonly file: string;
  readonly declared: ReadonlySet<string> | undefined;
}

function declareAtom(
  top: TopLevel,
  atom: { readonly name: string; readonly call: CallExpression; readonly isConst: boolean },
  where: Where,
): void {
  const found = atom.isConst ? atomOf(atom.call) : undefined;
  if (!found) {
    top.issues.push(scanIssue('state-unreadable', where.file, `${atom.name} ${ATOM_UNREADABLE}`));
    return;
  }
  top.atoms.set(atom.name, found);
  if (where.declared && !where.declared.has(`${found.plugin}.${found.key}`)) {
    top.issues.push(
      scanIssue('state-undeclared', where.file, `${found.plugin}.${found.key} is not declared`),
    );
  }
}

function recordImport(top: TopLevel, statement: ImportDeclaration): void {
  if (stringOf(statement.source) !== 'claude-code') return;
  for (const specifier of statement.specifiers) {
    if (isImportSpecifier(specifier) && isIdentifier(specifier.imported)) {
      top.imported.set(specifier.local.name, specifier.imported.name);
    }
  }
}

/** A top-level `atom(...)` or `derive(...)` of `claude-code`: the value it names, or an issue. */
function declareStateValue(
  top: TopLevel,
  value: { readonly name: string; readonly call: CallExpression; readonly isConst: boolean },
  where: Where,
): void {
  const { callee } = value.call;
  const imported = isIdentifier(callee) ? top.imported.get(callee.name) : undefined;
  if (imported === 'atom') declareAtom(top, value, where);
  if (imported !== 'derive') return;
  const sources = value.isConst ? derivedSources(top, value.call) : undefined;
  if (sources) top.derived.set(value.name, sources);
  else
    top.issues.push(scanIssue('state-unreadable', where.file, `${value.name} ${ATOM_UNREADABLE}`));
}

/** One `const name = ...` or `let name = ...` of a top-level declaration. */
function declareVariable(
  top: TopLevel,
  declaration: VariableDeclaration,
  isExported: boolean,
  where: Where,
): void {
  for (const declarator of declaration.declarations) {
    const { init } = declarator;
    if (!isIdentifier(declarator.id)) continue;
    const { name } = declarator.id;
    if (isFunction(init)) {
      top.functions.set(name, init);
      if (declaration.kind === CONST) top.registrable.add(name);
      if (isExported && name === 'register' && declaration.kind === CONST) top.register = init;
    }
    if (isCall(init)) {
      declareStateValue(top, { name, call: init, isConst: declaration.kind === CONST }, where);
    }
  }
}

function declare(
  top: TopLevel,
  statement: Node | null | undefined,
  isExported: boolean,
  where: Where,
): void {
  if (isFunctionDeclaration(statement)) {
    top.functions.set(statement.id.name, statement);
    top.registrable.add(statement.id.name);
    if (isExported && statement.id.name === 'register') top.register = statement;
  }
  if (isVariableDeclaration(statement)) declareVariable(top, statement, isExported, where);
}

/**
 * The local names an export list gives out as `register`: `export { register }`, `export { draw as
 * register }`, `export { draw as 'register' }` (what a bundler emits). A list that re-exports from
 * another file (`export { register } from './x.js'`) names no function of this file.
 */
function exportedAsRegister(statement: ExportNamedDeclaration): readonly string[] {
  if (statement.source) return [];
  return statement.specifiers.flatMap((specifier) =>
    isExportSpecifier(specifier) &&
    isIdentifier(specifier.local) &&
    exportedNameOf(specifier) === 'register'
      ? [specifier.local.name]
      : [],
  );
}

/** Reads the top level of a program: imports from `claude-code`, functions, `register` and atoms. */
export function indexProgram(
  program: Program,
  file: string,
  declared: ReadonlySet<string> | undefined,
): TopLevel {
  const top: TopLevel = {
    functions: new Map(),
    registrable: new Set(),
    atoms: new Map(),
    derived: new Map(),
    imported: new Map(),
    issues: [],
  };
  const where: Where = { file, declared };
  for (const statement of program.body) {
    if (isImportDeclaration(statement)) recordImport(top, statement);
  }
  const listed: string[] = [];
  for (const statement of program.body) {
    const exported = isExportNamed(statement);
    declare(top, exported ? statement.declaration : statement, exported, where);
    if (exported) listed.push(...exportedAsRegister(statement));
  }
  const listedRegister = listed
    .filter((name) => top.registrable.has(name))
    .map((name) => top.functions.get(name))
    .find(Boolean);
  if (!top.register && listedRegister) top.register = listedRegister;
  return top;
}
