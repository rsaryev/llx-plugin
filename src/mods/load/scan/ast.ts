import type {
  ArrayExpression,
  ArrowFunctionExpression,
  BlockStatement,
  CallExpression,
  ExportNamedDeclaration,
  Function as FunctionNode,
  FunctionDeclaration,
  FunctionExpression,
  Identifier,
  ImportDeclaration,
  ImportExpression,
  ImportSpecifier,
  Literal,
  MemberExpression,
  Node,
  ObjectExpression,
  Program,
  Property,
  VariableDeclaration,
  VariableDeclarator,
} from 'acorn';

/**
 * Typed views of syntax nodes. Acorn's types name every shape but give `Node` a string `type`, so
 * a node is narrowed by checking `type` and nowhere else: `typed` builds each guard once, from the
 * node type's name, so no other file compares a node's type to a string.
 */
type Maybe = Node | null | undefined;
const typed =
  <T extends Node>(name: T['type']) =>
  (node: Maybe): node is T =>
    node?.type === name;

export const isCall = typed<CallExpression>('CallExpression');
export const isMember = typed<MemberExpression>('MemberExpression');
export const isIdentifier = typed<Identifier>('Identifier');
export const isObject = typed<ObjectExpression>('ObjectExpression');
export const isArray = typed<ArrayExpression>('ArrayExpression');
export const isProperty = typed<Property>('Property');
export const isDeclarator = typed<VariableDeclarator>('VariableDeclarator');
export const isVariableDeclaration = typed<VariableDeclaration>('VariableDeclaration');
export const isFunctionDeclaration = typed<FunctionDeclaration>('FunctionDeclaration');
export const isImportDeclaration = typed<ImportDeclaration>('ImportDeclaration');
export const isImportSpecifier = typed<ImportSpecifier>('ImportSpecifier');
export const isExportNamed = typed<ExportNamedDeclaration>('ExportNamedDeclaration');
export const isImportExpression = typed<ImportExpression>('ImportExpression');
export const isBlock = typed<BlockStatement>('BlockStatement');
export const isProgram = typed<Program>('Program');
export const isLiteral = typed<Literal>('Literal');
const isFunctionExpression = typed<FunctionExpression>('FunctionExpression');
const isArrow = typed<ArrowFunctionExpression>('ArrowFunctionExpression');

export const isFunction = (
  node: Maybe,
): node is FunctionDeclaration | FunctionExpression | ArrowFunctionExpression =>
  isFunctionDeclaration(node) || isFunctionExpression(node) || isArrow(node);

/** The string a literal holds, or `undefined` for anything else. */
export const stringOf = (node: Maybe): string | undefined =>
  isLiteral(node) && typeof node.value === 'string' ? node.value : undefined;

/** The name a non-computed member access reads: `$.ui` is `ui`. */
export const memberName = (node: MemberExpression): string | undefined =>
  !node.computed && isIdentifier(node.property) ? node.property.name : undefined;

/** The name of a simple parameter, or `undefined` for a pattern. */
export const paramName = (fn: FunctionNode, index: number): string | undefined => {
  const param = fn.params[index];
  return isIdentifier(param) ? param.name : undefined;
};

/** The `const` of a declaration's `kind`. */
export const CONST: VariableDeclaration['kind'] = 'const';
