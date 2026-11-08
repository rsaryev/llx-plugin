import type { CallExpression, Function as FunctionNode, MemberExpression, Node } from 'acorn';
import { error, type PluginIssue } from '../../../format/issues.ts';
import { TELEMETRY_FILTER } from '../../../protocol/mods-events.ts';
import {
  isCall,
  isDeclarator,
  isFunction,
  isFunctionDeclaration,
  isIdentifier,
  isMember,
  isObject,
  memberName,
  paramName,
  stringOf,
} from './ast.ts';
import { GATING_EVENTS, KNOWN_EVENTS, TELEMETRY_NAMES } from './event-names.ts';
import { matcherLabel } from './matcher-label.ts';
import { ATOM_UNREADABLE, type TopLevel } from './top-level.ts';
import type { ScannedCall, ScannedHook } from './uses.ts';
import { childrenOf } from './walk.ts';

/**
 * What the scan reads in the hooks of a module (plugins/mods/create.md, "Check what Claude Code reads
 * from your mod"): the `on` calls of `register` and the mods API calls of each hook, written
 * `$.namespace.method`, with `$` passed only to a function declared at the top level of the same
 * file. The messages the docs quote are quoted; the others are the kit's words.
 */

const NOT_LITERAL = 'the event name passed to on() is not a string literal';
const SHADOWED = '"on" is declared again (shadowed)';
const COMPUTED = '(computed)';

export interface Found {
  readonly hooks: ScannedHook[];
  readonly calls: Map<string, ScannedCall>;
  readonly envReads: Set<string>;
  readonly envWrites: Set<string>;
  readonly stateReads: Set<string>;
  readonly stateWrites: Set<string>;
  readonly issues: PluginIssue[];
}

export const emptyFound = (): Found => ({
  hooks: [],
  calls: new Map(),
  envReads: new Set(),
  envWrites: new Set(),
  stateReads: new Set(),
  stateWrites: new Set(),
  issues: [],
});

interface Ctx {
  readonly dollar: string;
  readonly via?: string;
}

export interface Run {
  readonly file: string;
  readonly top: TopLevel;
  readonly found: Found;
  /** Nodes a rule already accounted for, so the generic check for `$` used as a value skips them. */
  readonly handled: Set<Node>;
  /** `on(...)` calls followed by `.catch(...)`. */
  readonly caught: Set<Node>;
  readonly seen: Set<string>;
  readonly queue: { readonly fn: FunctionNode; readonly via?: string }[];
}

/** Children the walk follows: a function's parameters are declarations, so only its body is read. */
const readable = (node: Node): readonly Node[] =>
  isFunction(node) ? [node.body] : childrenOf(node);

/** A walk with a context handed down: the visitor returns the context for the children, or `false` to stop. */
function walk<C>(root: Node, context: C, visit: (node: Node, context: C) => C | false): void {
  const stack: { readonly node: Node; readonly context: C }[] = [{ node: root, context }];
  for (let frame = stack.pop(); frame; frame = stack.pop()) {
    const next = visit(frame.node, frame.context);
    if (next === false) continue;
    for (const child of readable(frame.node).toReversed()) {
      stack.push({ node: child, context: next });
    }
  }
}

const fail = (run: Run, message: string): void => {
  run.found.issues.push(error(run.file, `${run.file}: ${message}`));
};

/** `$.ns.method(...)`: the namespace and method, when `node` is such a call on the `$` of `ctx`. */
function apiCall(
  node: CallExpression,
  dollar: string,
):
  | { readonly name: string; readonly member: MemberExpression; readonly space: MemberExpression }
  | undefined {
  const { callee } = node;
  if (!isMember(callee) || !isMember(callee.object)) return undefined;
  const space = callee.object;
  if (!isIdentifier(space.object) || space.object.name !== dollar) return undefined;
  const method = memberName(callee);
  const namespace = memberName(space);
  return method !== undefined && namespace !== undefined
    ? { name: `${namespace}.${method}`, member: callee, space }
    : undefined;
}

/** The literal first argument of `$.env.get` and the others, or `(computed)`. */
const literalArg = (call: CallExpression): string => stringOf(call.arguments[0]) ?? COMPUTED;

function recordUse(run: Run, name: string, call: CallExpression): void {
  const { found } = run;
  if (name === 'env.get') found.envReads.add(literalArg(call));
  if (name === 'env.set') found.envWrites.add(literalArg(call));
  if (name === 'state.get') found.stateReads.add(literalArg(call));
  if (name === 'state.set') found.stateWrites.add(literalArg(call));
}

function handleApiCall(
  run: Run,
  found: NonNullable<ReturnType<typeof apiCall>>,
  call: CallExpression,
  ctx: Ctx,
): void {
  const key = `${found.name}|${ctx.via ?? ''}`;
  if (!run.found.calls.has(key)) {
    run.found.calls.set(key, {
      name: found.name,
      ...(ctx.via === undefined ? {} : { via: ctx.via }),
    });
  }
  recordUse(run, found.name, call);
  run.handled.add(found.member);
  run.handled.add(found.space);
  run.handled.add(found.space.object);
}

const STATE_FUNCTIONS = { read: 'stateReads', update: 'stateWrites' } as const;

/** `read($, count)` and `update($, count, fn)` of `claude-code`: a read or a write of the value `count` names. */
function handleState(run: Run, imported: 'read' | 'update', call: CallExpression): void {
  const atom = call.arguments[1];
  const known = isIdentifier(atom) ? run.top.atoms.get(atom.name) : undefined;
  if (!known) {
    fail(run, `${isIdentifier(atom) ? atom.name : 'the value'} ${ATOM_UNREADABLE}`);
    return;
  }
  run.found[STATE_FUNCTIONS[imported]].add(`${known.plugin}.${known.key}`);
}

/** `f($)`: allowed for `read`, `update` and a function declared at the top level of the file. */
function handlePassed(run: Run, call: CallExpression, dollar: Node): void {
  const { callee } = call;
  const name = isIdentifier(callee) ? callee.name : undefined;
  const imported = name === undefined ? undefined : run.top.imported.get(name);
  if (imported === 'read' || imported === 'update') {
    run.handled.add(dollar);
    handleState(run, imported, call);
    return;
  }
  const target = name === undefined ? undefined : run.top.functions.get(name);
  if (name !== undefined && target) {
    run.handled.add(dollar);
    run.queue.push({ fn: target, via: name });
    return;
  }
  run.handled.add(dollar);
  fail(
    run,
    `$ is passed to ${name ?? 'a method'}, which the scan cannot read: pass $ only to a function declared at the top level of this file`,
  );
}

function handleCallNode(run: Run, node: CallExpression, ctx: Ctx): void {
  const { dollar } = ctx;
  const found = apiCall(node, dollar);
  if (found) {
    handleApiCall(run, found, node, ctx);
    return;
  }
  const passed = node.arguments.find((arg) => isIdentifier(arg) && arg.name === dollar);
  if (passed) handlePassed(run, node, passed);
}

/** `$.ns` that is not the start of a call: a value, which `$.plugin.name` and `$.plugin.root` are the only ones to be. */
function handleMemberNode(run: Run, node: MemberExpression, dollar: string): void {
  if (run.handled.has(node)) return;
  if (isMember(node.object) && !run.handled.has(node.object)) {
    const inner = node.object;
    const isPluginValue =
      isIdentifier(inner.object) && inner.object.name === dollar && memberName(inner) === 'plugin';
    if (isPluginValue) {
      run.handled.add(inner);
      run.handled.add(inner.object);
    }
    return;
  }
  if (!isIdentifier(node.object) || node.object.name !== dollar) return;
  run.handled.add(node.object);
  const namespace = memberName(node);
  fail(
    run,
    namespace === undefined
      ? '$ is indexed with a computed name'
      : `$.${namespace} is used as a value`,
  );
}

function analyse(run: Run, node: Node, ctx: Ctx): Ctx | false {
  const { dollar } = ctx;
  if (isFunction(node) && node.params.some((param) => isIdentifier(param) && param.name === dollar))
    return false;
  if (isCall(node)) handleCallNode(run, node, ctx);
  else if (isMember(node)) handleMemberNode(run, node, dollar);
  else if (isIdentifier(node) && node.name === dollar && !run.handled.has(node)) {
    fail(run, '$ is used as a value');
  }
  return ctx;
}

function analyseFunction(run: Run, fn: FunctionNode, via: string | undefined): void {
  const dollar = paramName(fn, 0);
  const key = `${fn.start}|${via ?? ''}`;
  if (dollar === undefined || run.seen.has(key)) return;
  run.seen.add(key);
  walk(fn.body, via === undefined ? { dollar } : { dollar, via }, (node, ctx) =>
    analyse(run, node, ctx),
  );
}

function drainQueue(run: Run): void {
  for (let item = run.queue.shift(); item; item = run.queue.shift()) {
    analyseFunction(run, item.fn, item.via);
  }
}

/** The hook function an `on` call passes: a function expression, or the name of a top-level function. */
function hookFunction(run: Run, node: Node | undefined): FunctionNode | undefined {
  if (isFunction(node)) return node;
  return isIdentifier(node) ? run.top.functions.get(node.name) : undefined;
}

/** The filter an `on` call gives, as `validate` prints it, when it has one: `on(event, matcher, hook)`. */
function matcherOf(second: Node | undefined, third: Node | undefined): string | undefined {
  return third !== undefined && isObject(second) ? matcherLabel(second) : undefined;
}

function handleOn(run: Run, call: CallExpression): void {
  const [first, second, third] = call.arguments;
  const event = stringOf(first);
  if (event === undefined) return fail(run, NOT_LITERAL);
  if (!KNOWN_EVENTS.has(event)) return fail(run, `"${event}" is not an event`);
  const matcher = matcherOf(second, third);
  if (TELEMETRY_NAMES.has(event) && matcher !== `to=${TELEMETRY_FILTER.to}`) {
    fail(run, `${event} needs the filter { to: 'collector' }`);
  }
  run.found.hooks.push({
    event,
    ...(matcher === undefined ? {} : { matcher }),
    hasCatch: run.caught.has(call),
    isGating: GATING_EVENTS.has(event),
  });
  const fn = hookFunction(run, third ?? second);
  if (fn) analyseFunction(run, fn, undefined);
  else fail(run, `the hook passed to on("${event}") is not a function the scan can read`);
}

/** Shadowing: a declaration of `on` anywhere in `register`. */
function isShadowing(node: Node, onName: string): boolean {
  if (isDeclarator(node)) return isIdentifier(node.id) && node.id.name === onName;
  if (isFunction(node)) {
    const own = isFunctionDeclaration(node) && node.id.name === onName;
    return own || node.params.some((param) => isIdentifier(param) && param.name === onName);
  }
  return false;
}

/** Reads `register(on)`: each `on` call, `.catch` on it, and any other declaration of `on`. */
export function scanRegister(run: Run, register: FunctionNode): void {
  const onName = paramName(register, 0);
  if (onName === undefined) return;
  walk(register.body, undefined, (node) => {
    if (isShadowing(node, onName)) fail(run, SHADOWED);
    if (!isCall(node)) return undefined;
    if (isIdentifier(node.callee) && node.callee.name === onName) handleOn(run, node);
    const callee = node.callee;
    if (isMember(callee) && memberName(callee) === 'catch' && isCall(callee.object)) {
      run.caught.add(callee.object);
      const handler = node.arguments[0];
      if (isFunction(handler)) analyseFunction(run, handler, undefined);
    }
    return undefined;
  });
  drainQueue(run);
}

export function newRun(file: string, top: TopLevel, found: Found): Run {
  return { file, top, found, handled: new Set(), caught: new Set(), seen: new Set(), queue: [] };
}
