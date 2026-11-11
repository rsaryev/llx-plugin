/**
 * The shape of `spec/mods-declarations.json`: what the mods declarations of one release declare,
 * as names, fields and the lines they are on (AGENTS.md, E2a). `bun run types:extract` writes it
 * from `.cache/claude-types/`; `check:spec` (SP8) compares it with the pulled declarations, so a
 * test never reads `.cache` (docs/TESTING.md).
 */
import { join } from 'node:path';
import { z } from 'zod';
import { ROOT } from '../../docs/location.ts';

export const DECLARATIONS_FILE = join(ROOT, 'spec', 'mods-declarations.json');

const field = z.strictObject({ name: z.string(), optional: z.boolean() });

/**
 * One kind of value a declared type allows (shape.ts): a primitive, a literal, a function, an array
 * of a shape, or an object with its fields (`open` when it has an index signature; `name` alone when
 * it is declared outside the mods declarations, such as `Uint8Array`; neither past the last level).
 */
export type Alternative =
  | { readonly kind: 'any' | 'undefined' | 'null' | 'never' | 'boolean' | 'string' | 'number' }
  | { readonly kind: 'bigint' | 'function' }
  | { readonly kind: 'literal'; readonly value: string | number | boolean }
  | { readonly kind: 'array'; readonly of: Shape }
  | {
      readonly kind: 'object';
      readonly name?: string | undefined;
      readonly fields?: readonly TypedField[] | undefined;
      readonly open?: boolean | undefined;
    };
/** The values a declared type allows: any one of its alternatives. */
export type Shape = readonly Alternative[];
/** A property or a parameter with the shape of its type. */
export interface TypedField {
  readonly name: string;
  readonly optional: boolean;
  readonly shape: Shape;
}

const alternative: z.ZodType<Alternative> = z.lazy(() =>
  z.union([
    z.strictObject({
      kind: z.enum(['any', 'undefined', 'null', 'never', 'boolean', 'string', 'number']),
    }),
    z.strictObject({ kind: z.enum(['bigint', 'function']) }),
    z.strictObject({
      kind: z.literal('literal'),
      value: z.union([z.string(), z.number(), z.boolean()]),
    }),
    z.strictObject({ kind: z.literal('array'), of: shape }),
    z.strictObject({
      kind: z.literal('object'),
      name: z.string().optional(),
      fields: z.array(typedField).optional(),
      open: z.boolean().optional(),
    }),
  ]),
);
const shape: z.ZodType<Shape> = z.lazy(() => z.array(alternative));
const typedField: z.ZodType<TypedField> = z.lazy(() =>
  z.strictObject({ name: z.string(), optional: z.boolean(), shape }),
);

/** One signature of a call: its parameters with their shapes, the text of what it returns, and the shape of what it settles with. */
const call = z.strictObject({ params: z.array(typedField), returns: z.string(), result: shape });

/** How a member of `$` answers, from its declared type (the kinds of `describeApi`). */
export const MEMBER_KINDS = ['value', 'call', 'sync', 'timer', 'stream'] as const;

const member = z.strictObject({
  line: z.number(),
  kind: z.enum(MEMBER_KINDS),
  calls: z.array(call),
});

const event = z.strictObject({
  line: z.number(),
  /** The fields of `e` with their shapes; on a union of many variants, only the fields every variant has. */
  input: z.array(typedField),
  /** The fields of what a hook returns and `next(e)` resolves to. */
  result: z.array(field),
});

export const declarationsSchema = z.strictObject({
  claudeCode: z.string(),
  /** The engine's events and the calls on `$` (EngineEventOf and OpEventOf), by name. */
  events: z.record(z.string(), event),
  /** `classic.<Event>`: the settings hook events, by name (ClassicEventOf). */
  classicEvents: z.array(z.string()),
  /** `$` (CoreEngineInterface): each namespace's members. */
  api: z.record(z.string(), z.record(z.string(), member)),
  /** The fields of `next` (Next), and those only a `.catch` handler's has (Caught). */
  next: z.strictObject({ line: z.number(), fields: z.array(z.string()) }),
  caught: z.array(z.string()),
  /** The element table of each surface (Elements): the element names. */
  elements: z.record(z.string(), z.array(z.string())),
  /** Each element's props, `children` aside. */
  props: z.record(z.string(), z.array(field)),
  /** The values `claude-code` exports: the state helpers (`atom`, `derive`, ...). */
  exports: z.record(z.string(), z.strictObject({ line: z.number(), calls: z.array(call) })),
  /** What `claude-code/testing` exports. */
  testing: z.record(z.string(), z.number()),
  /** The built-in tools' inputs (BuiltinToolInputs, claude-code-tools). */
  tools: z.record(z.string(), z.array(field)),
});

export type Declarations = z.infer<typeof declarationsSchema>;
