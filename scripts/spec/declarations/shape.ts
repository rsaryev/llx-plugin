/**
 * The shape of a declared type as plain data, for the snapshot (snapshot.ts, `Shape`): what kind of
 * value it is, the literal it is, the fields of an object and what an array holds, a few levels
 * deep. A type declared outside the mods declarations (`Uint8Array`, `AbortSignal`) is an object
 * by its name, its fields left out; a level past the last is `any`.
 */
import { SignatureKind, TypeFlags } from 'typescript/unstable/async';
import type {
  Checker,
  LiteralType,
  Symbol as TsSymbol,
  Type,
  TypeReference,
} from 'typescript/unstable/async';
import type { Alternative, Shape, TypedField } from './snapshot.ts';

/** How many levels of fields a shape holds: a parameter, its fields, theirs. */
export const SHAPE_DEPTH = 3;

export interface ShapeContext {
  readonly checker: Checker;
  /** Whether a symbol is declared in the mods declarations, not in a library of the language. */
  readonly isOwn: (symbol: TsSymbol) => Promise<boolean>;
  /** Whether a property may be left out. */
  readonly isOptional: (symbol: TsSymbol) => boolean;
}

const ANY: Alternative = { kind: 'any' };

/** The primitive kinds by their flag; the first that matches wins. */
const PRIMITIVES: readonly (readonly [number, Alternative])[] = [
  [TypeFlags.AnyOrUnknown, ANY],
  [TypeFlags.Undefined | TypeFlags.Void, { kind: 'undefined' }],
  [TypeFlags.Null, { kind: 'null' }],
  [TypeFlags.Never, { kind: 'never' }],
  [TypeFlags.Boolean, { kind: 'boolean' }],
  [TypeFlags.String | TypeFlags.TemplateLiteral | TypeFlags.StringMapping, { kind: 'string' }],
  [TypeFlags.Number, { kind: 'number' }],
  [TypeFlags.BigInt, { kind: 'bigint' }],
];

const LITERALS = TypeFlags.StringLiteral | TypeFlags.NumberLiteral | TypeFlags.BooleanLiteral;

function literalOf(type: Type): Alternative | undefined {
  if ((type.flags & LITERALS) === 0) return undefined;
  const { value } = type as LiteralType; // A literal type has its `value` (types.d.ts, LiteralType).
  return typeof value === 'bigint' ? { kind: 'bigint' } : { kind: 'literal', value };
}

/** More objects than this in one union is a table of shapes (`tool.call`, one per tool): it is held as any object. */
const MANY_OBJECTS = 8;

function folded(shape: Shape): Shape {
  const objects = shape.filter((one) => one.kind === 'object');
  if (objects.length <= MANY_OBJECTS) return shape;
  return [...shape.filter((one) => one.kind !== 'object'), { kind: 'object', open: true }];
}

async function fieldsOf(
  context: ShapeContext,
  type: Type,
  depth: number,
): Promise<readonly TypedField[]> {
  const symbols = await context.checker.getPropertiesOfType(type);
  const types = await context.checker.getTypeOfSymbol(symbols);
  return Promise.all(
    symbols.map(async (symbol, index) => {
      const of = types[index];
      return {
        name: symbol.name,
        optional: context.isOptional(symbol),
        shape: of ? await shapeOf(context, of, depth - 1) : [ANY],
      };
    }),
  );
}

async function objectOf(context: ShapeContext, type: Type, depth: number): Promise<Alternative> {
  const { checker } = context;
  if ((await checker.getSignaturesOfType(type, SignatureKind.Call)).length > 0) {
    return { kind: 'function' };
  }
  if ((await checker.isArrayType(type)) || (await checker.isTupleType(type))) {
    const [item] = await checker.getTypeArguments(type as TypeReference); // An array type is a reference to `Array<T>`.
    return {
      kind: 'array',
      of: item && depth > 0 ? await shapeOf(context, item, depth - 1) : [ANY],
    };
  }
  // An alias of the language's (`Record`, `Readonly`) is read through; an interface of its (`Uint8Array`) is named.
  const symbol = await type.getSymbol();
  if (symbol && !symbol.name.startsWith('__') && !(await context.isOwn(symbol))) {
    return { kind: 'object', name: symbol.name };
  }
  const open = (await checker.getIndexInfosOfType(type)).length > 0;
  if (depth <= 0) return { kind: 'object', ...(open ? { open } : {}) };
  return {
    kind: 'object',
    fields: [...(await fieldsOf(context, type, depth))].toSorted((a, b) =>
      a.name.localeCompare(b.name),
    ),
    ...(open ? { open } : {}),
  };
}

async function alternativeOf(
  context: ShapeContext,
  type: Type,
  depth: number,
): Promise<readonly Alternative[]> {
  const primitive = PRIMITIVES.find(([flags]) => (type.flags & flags) !== 0);
  if (primitive) return [primitive[1]];
  const literal = literalOf(type);
  if (literal) return [literal];
  if ((type.flags & TypeFlags.TypeParameter) !== 0) {
    // A parameter bound by what a mod declares itself (`keyof PluginState`, empty until it does) is any.
    const constraint = await context.checker.getBaseConstraintOfType(type);
    if (!constraint || constraint.id === type.id) return [ANY];
    const bound = await shapeOf(context, constraint, depth);
    if (bound.every((one) => one.kind === 'never')) return [ANY];
    // What a parameter is bound by is the least it takes: an object of it may carry more.
    return bound.map((one) => (one.kind === 'object' ? { ...one, open: true } : one));
  }
  // `string & {}` (a name the declarations list, or any other) is a string.
  if (type.isIntersectionType()) {
    const members = await type.getTypes();
    const primitive = members?.find((one) =>
      PRIMITIVES.some(([flags]) => (one.flags & flags) !== 0),
    );
    if (primitive) return alternativeOf(context, primitive, depth);
  }
  if ((type.flags & (TypeFlags.Object | TypeFlags.Intersection | TypeFlags.NonPrimitive)) !== 0) {
    return [await objectOf(context, type, depth)];
  }
  return [ANY];
}

/** Each alternative once. */
export const distinct = (shape: Shape): Shape => [
  ...new Map(shape.map((one) => [JSON.stringify(one), one])).values(),
];

/** The shape of `type`: one alternative, or one for each member of a union (`true | false` is `boolean`). */
export async function shapeOf(context: ShapeContext, type: Type, depth: number): Promise<Shape> {
  if ((type.flags & TypeFlags.Union) === 0 || (type.flags & TypeFlags.Boolean) !== 0) {
    return [...(await alternativeOf(context, type, depth))];
  }
  const members = type.isUnionType() ? ((await type.getTypes()) ?? []) : [];
  const each = await Promise.all(members.map((one) => alternativeOf(context, one, depth)));
  const flat = each.flat();
  const booleans = flat.filter((one) => one.kind === 'literal' && typeof one.value === 'boolean');
  const merged =
    booleans.length === 2
      ? [...flat.filter((one) => !booleans.includes(one)), { kind: 'boolean' } as const]
      : flat;
  return folded(distinct(merged));
}
