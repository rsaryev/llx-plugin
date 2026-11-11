import type { Node } from 'acorn';
import { scanIssue, type ModScanIssue, type ModScanIssueCode } from './issue-codes.ts';
import {
  isCall,
  isIdentifier,
  isLiteral,
  isObject,
  isProperty,
  isTemplate,
  stringOf,
} from './ast.ts';
import { isRelative, leavesRoot } from './file-rules.ts';
import { childrenOf } from './walk.ts';

/**
 * The surface modules a hooks module's `Client` elements name, read off the source: the docs say a
 * `Client` is "a region drawn by a second file of yours" and give `module` as its prop
 * (interface.md, "Build a tree from elements"; reference.md, "Elements"), not how Claude Code finds
 * that file; the declarations say JSX is bare `h(...)` calls and a `<Client>` is read off the
 * source (claude-code/index.d.ts:16450), so `h(Client, { module })` is read as `Client({ module })`.
 * What follows is oracle 2.1.322 (`claude plugin validate`, a black box; spec/judgments.md):
 * each call of a function named `Client` whose object names `module` must give it as a string
 * literal (a template without `${}` counts), relative to the file and inside the plugin's folder;
 * the module is then listed as a path from the plugin root, and a host bundles exactly those.
 */
/**
 * Where a `Client`'s `module` literal sits in the text scanned: `start` and `end` are offsets of the
 * literal, quotes included, and `module` the path from the plugin root it names. Judgment: the docs
 * do not say how a host finds the file, so this is for a host that rewrites the specifier.
 */
export interface SurfaceModuleSpan {
  readonly module: string;
  readonly start: number;
  readonly end: number;
}

export interface ClientModules {
  /** Each surface module, as a path from the plugin root, once, in source order. */
  readonly modules: readonly string[];
  /** Each `module` literal that names one, in source order: a host that bundles rewrites the text there. */
  readonly spans: readonly SurfaceModuleSpan[];
  readonly issues: readonly ModScanIssue[];
}

const LITERAL =
  "Client module must be a string literal, the surface module's path relative to this file";
const OBJECT =
  'Client takes its props as an object literal ({ module: "./board.tsx", key }), so the surface module it names can be read before it runs';
const NO_MODULE =
  'Client names no module: give it module, the surface module\'s path as a string literal ("./board.tsx")';
const KINDS: Readonly<Record<string, string>> = {
  BinaryExpression: 'a concatenation',
  CallExpression: 'a call',
  MemberExpression: 'a member read',
  TemplateLiteral: 'a template with a substitution',
};

/** The literal text of `node`: a string, or a template with no substitution. */
function literalOf(node: Node): string | undefined {
  if (isTemplate(node)) {
    return node.expressions.length === 0 ? (node.quasis[0]?.value.cooked ?? undefined) : undefined;
  }
  return stringOf(node);
}

/** What the message calls a value that is not what it should be; `an expression` is the kit's word for the kinds the oracle was not asked. */
function kindOf(node: Node | undefined): string {
  if (node === undefined) return 'no argument';
  if (isIdentifier(node)) return `the variable ${node.name}`;
  if (isLiteral(node)) return `the literal ${node.raw ?? String(node.value)}`;
  return KINDS[node.type] ?? 'an expression';
}

/** `a/b` joined with `../c/d.js`, `.` and `..` resolved: a path from the plugin root. */
function joined(directory: string, specifier: string): string {
  const parts = directory.split('/').filter((part) => part !== '' && part !== '.');
  for (const part of specifier.split('/')) {
    if (part === '..') parts.pop();
    else if (part !== '.' && part !== '') parts.push(part);
  }
  return parts.join('/');
}

const isNamed = (node: Node | undefined, name: string): boolean =>
  node !== undefined && isIdentifier(node) && node.name === name;

/**
 * The props of a `Client`, written as a call, `Client({ ... })`, or as JSX, which compiles to "bare
 * `h(...)` calls resolved by name" (claude-code/index.d.ts:16450): `h(Client, { ... })`. `isClient`
 * is false for any other node; `props` is undefined for a `Client` given no argument.
 */
function clientProps(node: Node): { readonly isClient: boolean; readonly props?: Node } {
  if (!isCall(node)) return { isClient: false };
  const [first, second] = node.arguments;
  if (isNamed(node.callee, 'Client')) return { isClient: true, ...(first && { props: first }) };
  const isClient = isNamed(node.callee, 'h') && isNamed(first, 'Client');
  return { isClient, ...(isClient && second && { props: second }) };
}

/**
 * The `module` value of a `Client`, a refusal when its props are no object literal or name no
 * `module` (oracle 2.1.321: a spread or a computed key does not name it), or `undefined` for a node
 * that is no `Client`.
 */
function moduleOf(node: Node): { readonly value: Node } | { readonly problem: string } | undefined {
  const { isClient, props } = clientProps(node);
  if (!isClient) return undefined;
  if (props === undefined || !isObject(props))
    return { problem: `${OBJECT} (got ${kindOf(props)})` };
  const found = props.properties.find(
    (property) =>
      isProperty(property) &&
      !property.computed &&
      (isIdentifier(property.key) ? property.key.name : stringOf(property.key)) === 'module',
  );
  return isProperty(found) ? { value: found.value } : { problem: NO_MODULE };
}

/** Every `Client` module of a program; `directory` is the file's folder from the plugin root. */
export function clientModules(program: Node, file: string, directory: string): ClientModules {
  const modules = new Set<string>();
  const spans: SurfaceModuleSpan[] = [];
  const issues: ModScanIssue[] = [];
  const fail = (code: ModScanIssueCode, message: string): void =>
    void issues.push(scanIssue(code, file, message));
  const stack: Node[] = [program];
  for (let node = stack.pop(); node; node = stack.pop()) {
    stack.push(...childrenOf(node).toReversed());
    const found = moduleOf(node);
    if (found === undefined) continue;
    if ('problem' in found) {
      fail('client-props', found.problem);
      continue;
    }
    const { value } = found;
    const text = literalOf(value);
    if (text === undefined) fail('client-module', `${LITERAL} (got ${kindOf(value)})`);
    else if (!isRelative(text)) {
      fail(
        'client-module',
        `Client module "${text}" is not relative: spell the surface module's path from this file ("./board.tsx")`,
      );
    } else if (leavesRoot(directory, text))
      fail('client-module', `Client module "${text}" leaves the plugin's folder`);
    else {
      const module = joined(directory, text);
      modules.add(module);
      spans.push({ module, start: value.start, end: value.end });
    }
  }
  return { modules: [...modules], spans, issues };
}
