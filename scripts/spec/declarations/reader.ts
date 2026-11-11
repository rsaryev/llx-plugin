/**
 * Reads the mods declarations (`.cache/claude-types/`, `bun run types:pull`) through the
 * TypeScript checker, never by matching their text: a scratch project names each type the snapshot
 * needs as a `declare const`, and the checker answers its properties, their optionality, the
 * signatures of the calls and the line each is declared on. The API is the pinned compiler's
 * (`typescript/unstable/async`).
 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { API, SignatureKind, SymbolFlags, TypeFlags } from 'typescript/unstable/async';
import type {
  Checker,
  Signature,
  Symbol as TsSymbol,
  Type,
  TypeReference,
  UnionOrIntersectionType,
} from 'typescript/unstable/async';
import { TYPES_DIR } from '../../docs/location.ts';
import { distinct, SHAPE_DEPTH, shapeOf, type ShapeContext } from './shape.ts';
import type { Shape, TypedField } from './snapshot.ts';

/** A property or a parameter: its name and whether it may be left out. */
export interface Field {
  readonly name: string;
  readonly optional: boolean;
}

/** One signature of a call: its parameters, the text of what it returns and the shape of what it settles with. */
export interface Call {
  readonly params: TypedField[];
  readonly returns: string;
  readonly result: Shape;
}

/** A property with its type and the line of `claude-code/index.d.ts` (or the tools file) it is on. */
export interface Member {
  readonly name: string;
  readonly type: Type;
  readonly line: number;
}

export interface Reader {
  /**
   * The properties of a type, or of every member of a union (one only some members have is
   * optional); with `shared`, only those every member has.
   */
  fields(type: Type, options?: { readonly shared?: boolean }): Promise<readonly Field[]>;
  /** The same properties with the shape of each one's type, over every member of a union. */
  typedFields(type: Type, options?: { readonly shared?: boolean }): Promise<readonly TypedField[]>;
  /** The properties of a type with each one's type and line, in declaration order. */
  members(type: Type): Promise<readonly Member[]>;
  /** Every call signature of a type, overloads in order. */
  calls(type: Type): Promise<Call[]>;
  /** How many variants a union has (1 for a type that is not one). */
  variants(type: Type): Promise<number>;
  /** The type of the first parameter of the first call signature. */
  firstParam(type: Type): Promise<Type | undefined>;
  /** The line the type alias or interface a type was named by is declared on (0 when unnamed). */
  lineOfType(type: Type): Promise<number>;
  /** The type of a `declare const` the probe holds. */
  named(name: string): Promise<Type>;
}

const isUnion = (type: Type): type is UnionOrIntersectionType =>
  (type.flags & TypeFlags.Union) !== 0;

const EMPTY = TypeFlags.Undefined | TypeFlags.Void | TypeFlags.Null | TypeFlags.Never;
const STRUCTURED = TypeFlags.Object | TypeFlags.Intersection;

async function constituents(type: Type): Promise<readonly Type[]> {
  if (!isUnion(type)) return [type];
  return (await type.getTypes()).filter((member) => (member.flags & EMPTY) === 0);
}

const optionalOf = (symbol: TsSymbol): boolean => (symbol.flags & SymbolFlags.Optional) !== 0;

/** The 1-based line a declaration starts on, past the comment that leads it. */
function lineAt(text: string, pos: number): number {
  const lead = /^(?:\s|\/\*[\s\S]*?\*\/|\/\/[^\n]*)*/.exec(text.slice(pos))?.[0].length ?? 0;
  let line = 1;
  for (let at = text.indexOf('\n'); at >= 0 && at < pos + lead; at = text.indexOf('\n', at + 1)) {
    line += 1;
  }
  return line;
}

interface Context {
  readonly checker: Checker;
  readonly texts: Map<string, string>;
}

async function lineOf(context: Context, symbol: TsSymbol): Promise<number> {
  const handle = symbol.declarations[0];
  if (!handle) return 0;
  const node = await handle.resolve();
  if (!node) return 0;
  const path = String(handle.path);
  const text = context.texts.get(path) ?? (await readFile(path, 'utf8').catch(() => ''));
  context.texts.set(path, text);
  return lineAt(text, node.pos);
}

async function paramOf(shapes: ShapeContext, symbol: TsSymbol): Promise<TypedField> {
  const node = await symbol.declarations[0]?.resolve();
  const declared: unknown = node === undefined ? undefined : Reflect.get(node, 'questionToken');
  const rest: unknown = node === undefined ? undefined : Reflect.get(node, 'dotDotDotToken');
  const type = await shapes.checker.getTypeOfSymbol(symbol);
  return {
    name: symbol.name,
    optional: declared !== undefined || rest !== undefined,
    shape: type ? await shapeOf(shapes, type, SHAPE_DEPTH) : [{ kind: 'any' }],
  };
}

/** What a call settles with: a promise's value, a stream's result, or what it returns. */
async function settledOf(checker: Checker, returned: Type): Promise<Type> {
  const symbol = (await returned.getAliasSymbol()) ?? (await returned.getSymbol());
  const name = symbol?.name ?? '';
  if (name !== 'Promise' && name !== 'HookStream') return returned;
  const args =
    name === 'Promise'
      ? await checker.getTypeArguments(returned as TypeReference) // `Promise<T>` is a reference to the interface.
      : await returned.getAliasTypeArguments();
  return args.at(-1) ?? returned;
}

async function callOf(shapes: ShapeContext, signature: Signature): Promise<Call> {
  const { checker } = shapes;
  const params = await Promise.all(
    (await signature.getParameters()).map((symbol) => paramOf(shapes, symbol)),
  );
  const returned = await checker.getReturnTypeOfSignature(signature);
  if (!returned) return { params, returns: 'unknown', result: [{ kind: 'any' }] };
  return {
    params,
    returns: await checker.typeToString(returned),
    result: await shapeOf(shapes, await settledOf(checker, returned), SHAPE_DEPTH),
  };
}

function shapeContext(checker: Checker): ShapeContext {
  return {
    checker,
    // The checker answers paths in lower case on a file system that ignores case.
    isOwn: async (symbol) =>
      String(symbol.declarations[0]?.path ?? '')
        .toLowerCase()
        .startsWith(TYPES_DIR.toLowerCase()),
    isOptional: optionalOf,
  };
}

function readerOf(context: Context, probe: string, source: string): Reader {
  const { checker } = context;
  const shapes = shapeContext(checker);
  const own = async (type: Type): Promise<readonly TsSymbol[]> =>
    (type.flags & STRUCTURED) !== 0 ? checker.getPropertiesOfType(type) : [];
  return {
    async typedFields(type, options) {
      const fields = await this.fields(type, options);
      const members = await constituents(type);
      return Promise.all(
        fields.map(async (field) => {
          const each: Shape[] = [];
          for (const member of members) {
            const symbol = await checker.getPropertyOfType(member, field.name);
            const of = symbol ? await checker.getTypeOfSymbol(symbol) : undefined;
            if (of) each.push(await shapeOf(shapes, of, SHAPE_DEPTH - 1));
          }
          return { ...field, shape: distinct(each.flat()) };
        }),
      );
    },
    async fields(type, options) {
      const members = await constituents(type);
      const seen = new Map<string, { optional: boolean; count: number }>();
      for (const member of members) {
        for (const symbol of await own(member)) {
          const known = seen.get(symbol.name) ?? { optional: false, count: 0 };
          seen.set(symbol.name, {
            optional: known.optional || optionalOf(symbol),
            count: known.count + 1,
          });
        }
      }
      const all = [...seen].filter(([, { count }]) => !options?.shared || count === members.length);
      return all.map(([name, { optional, count }]) => ({
        name,
        optional: optional || count < members.length,
      }));
    },
    async members(type) {
      const symbols = await own(type);
      const types = await checker.getTypeOfSymbol(symbols);
      const lines = await Promise.all(symbols.map((symbol) => lineOf(context, symbol)));
      return symbols.flatMap((symbol, index) => {
        const of = types[index];
        return of ? [{ name: symbol.name, type: of, line: lines[index] ?? 0 }] : [];
      });
    },
    async calls(type) {
      const signatures = await checker.getSignaturesOfType(type, SignatureKind.Call);
      return Promise.all(signatures.map((signature) => callOf(shapes, signature)));
    },
    variants: async (type) => (await constituents(type)).length,
    async firstParam(type) {
      const [signature] = await checker.getSignaturesOfType(type, SignatureKind.Call);
      return signature ? checker.getParameterType(signature, 0) : undefined;
    },
    async lineOfType(type) {
      const symbol = (await type.getAliasSymbol()) ?? (await type.getSymbol());
      return symbol ? lineOf(context, symbol) : 0;
    },
    async named(name) {
      const at = source.indexOf(`declare const ${name}:`);
      if (at < 0) throw new Error(`the probe declares no ${name}`);
      const type = await checker.getTypeAtPosition(probe, at + 'declare const '.length);
      if (!type) throw new Error(`the checker has no type for ${name}`);
      return type;
    },
  };
}

const PROJECT = {
  target: 'es2023',
  lib: ['es2023'],
  module: 'esnext',
  moduleResolution: 'bundler',
  strict: true,
  noEmit: true,
  skipLibCheck: true,
  typeRoots: [TYPES_DIR],
  types: ['claude-code', 'claude-code-tools', 'claude-code-mcp'],
};

/** Runs `read` over a scratch project whose probe holds `source`, then closes the compiler. */
export async function withDeclarations<T>(
  source: string,
  read: (reader: Reader) => Promise<T>,
): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'declarations-'));
  const probe = join(dir, 'probe.ts');
  await writeFile(probe, source);
  await writeFile(
    join(dir, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: PROJECT, files: ['probe.ts'] }),
  );
  const api = new API({ cwd: dir });
  try {
    const snapshot = await api.updateSnapshot({ openProjects: [join(dir, 'tsconfig.json')] });
    const [project] = snapshot.getProjects();
    if (!project) throw new Error('the declarations project did not open');
    return await read(readerOf({ checker: project.checker, texts: new Map() }, probe, source));
  } finally {
    await api.close();
    await rm(dir, { recursive: true, force: true });
  }
}
