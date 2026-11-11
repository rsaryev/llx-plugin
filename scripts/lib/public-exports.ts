/**
 * The public surface: every name each `exports` entry of package.json makes importable, with what
 * kind of thing it is, resolved through the barrels (`export *`, `export { … } from`, local
 * declarations and imports re-exported) by parsing, never by running the code. The docs gate
 * (`scripts/check-docs.ts`, DOC3) compares it with the export tables of `docs/api/`.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { parseSync } from 'oxc-parser';
import { ROOT } from '../docs/location.ts';

/** What an exported name is, as the export tables of `docs/api/` write it. */
export type ExportKind = 'class' | 'constant' | 'function' | 'namespace' | 'type';

/** One name an entry exports, and the declaration it ends at (`file#name`). */
export interface PublicExport {
  readonly name: string;
  readonly kind: ExportKind;
  readonly origin: string;
}

/** One `exports` entry: its subpath (`.`, `./loading`, …) and its source file. */
export interface PublicEntry {
  readonly subpath: string;
  readonly file: string;
}

interface Binding {
  readonly kind: ExportKind;
  readonly origin: string;
}

interface Parsed {
  readonly program: { readonly body: readonly Statement[] };
  readonly module: {
    readonly staticImports: readonly {
      readonly moduleRequest: { readonly value: string };
      readonly entries: readonly {
        readonly importName: { readonly kind: string; readonly name: string | null };
        readonly localName: { readonly value: string };
      }[];
    }[];
    readonly staticExports: readonly { readonly entries: readonly ExportEntry[] }[];
  };
}

interface ExportEntry {
  readonly moduleRequest: { readonly value: string } | null;
  readonly importName: { readonly kind: string; readonly name: string | null };
  readonly exportName: { readonly kind: string; readonly name: string | null };
  readonly localName: { readonly kind: string; readonly name: string | null };
}

interface Statement {
  readonly type: string;
  readonly id?: { readonly name: string } | null;
  readonly declarations?: readonly { readonly id: { readonly name?: string } }[];
  readonly declaration?: Statement | null;
  readonly init?: { readonly type: string } | null;
}

const VALUE_KINDS: Readonly<Record<string, ExportKind>> = {
  FunctionDeclaration: 'function',
  TSDeclareFunction: 'function',
  ClassDeclaration: 'class',
  TSEnumDeclaration: 'constant',
  TSModuleDeclaration: 'namespace',
};
const TYPE_DECLARATIONS = new Set(['TSInterfaceDeclaration', 'TSTypeAliasDeclaration']);
const FUNCTION_INITS = new Set(['ArrowFunctionExpression', 'FunctionExpression']);

const parsedFiles = new Map<string, Parsed>();
const moduleExports = new Map<string, ReadonlyMap<string, Binding>>();

/** The parsed source of a file, read once. */
export function parsedSource(file: string): Parsed {
  const known = parsedFiles.get(file);
  if (known !== undefined) return known;
  // oxc's result is ESTree with TypeScript nodes; this script reads only the fields `Parsed` names.
  const parsed = parseSync(file, readFileSync(file, 'utf8')) as unknown as Parsed;
  parsedFiles.set(file, parsed);
  return parsed;
}

/** The entries of package.json `exports` that name a source file (every one but `./package.json`). */
export function publicEntries(): PublicEntry[] {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
    readonly exports: Readonly<Record<string, string | Readonly<Record<string, string>>>>;
  };
  return Object.entries(manifest.exports).flatMap(([subpath, target]) => {
    const source = typeof target === 'string' ? undefined : target['llx-plugin-source'];
    return source === undefined ? [] : [{ subpath, file: join(ROOT, source) }];
  });
}

/** Every name an entry exports, sorted. */
export function exportsOf(entry: PublicEntry): PublicExport[] {
  return [...namesOf(entry.file)]
    .map(([name, binding]) => ({ name, ...binding }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The declaration kinds of the top-level names of a file, a value winning over a type. */
function localKinds(parsed: Parsed): Map<string, ExportKind> {
  const kinds = new Map<string, ExportKind>();
  const note = (name: string | undefined, kind: ExportKind): void => {
    if (name === undefined) return;
    if (kinds.get(name) === undefined || kinds.get(name) === 'type') kinds.set(name, kind);
  };
  for (const outer of parsed.program.body) {
    const statement = outer.declaration ?? outer;
    if (TYPE_DECLARATIONS.has(statement.type)) note(statement.id?.name, 'type');
    const valueKind = VALUE_KINDS[statement.type];
    if (valueKind !== undefined) note(statement.id?.name, valueKind);
    for (const declarator of statement.declarations ?? []) {
      const init = (declarator as Statement).init?.type ?? '';
      note(declarator.id.name, FUNCTION_INITS.has(init) ? 'function' : 'constant');
    }
  }
  return kinds;
}

function target(file: string, request: string): string {
  if (!request.startsWith('.')) return request;
  return resolve(dirname(file), request);
}

const origin = (file: string, name: string): string =>
  `${file.startsWith('/') ? relative(ROOT, file) : file}#${name}`;

/** What `name` imported from `request` in `file` is: a kit file is followed, a package is a type. */
function imported(file: string, request: string, name: string | null): Binding {
  const from = target(file, request);
  if (!from.startsWith('/')) return { kind: 'type', origin: origin(from, name ?? '*') };
  if (name === null) return { kind: 'namespace', origin: origin(from, '*') };
  const binding = namesOf(from).get(name);
  if (binding === undefined)
    throw new Error(`${relative(ROOT, file)}: ${name} is not exported by ${request}`);
  return binding;
}

/** The binding of a top-level name of `file`: an import followed, or its own declaration. */
function localBinding(file: string, parsed: Parsed, name: string): Binding {
  for (const declaration of parsed.module.staticImports) {
    for (const entry of declaration.entries) {
      if (entry.localName.value !== name) continue;
      return imported(file, declaration.moduleRequest.value, entry.importName.name);
    }
  }
  const kind = localKinds(parsed).get(name);
  if (kind === undefined) throw new Error(`${relative(ROOT, file)}: no declaration of ${name}`);
  return { kind, origin: origin(file, name) };
}

function entryBinding(file: string, parsed: Parsed, entry: ExportEntry): Binding {
  const request = entry.moduleRequest?.value;
  if (request === undefined) return localBinding(file, parsed, entry.localName.name ?? '');
  if (entry.importName.kind === 'All')
    return { kind: 'namespace', origin: origin(target(file, request), '*') };
  return imported(file, request, entry.importName.name);
}

/** `export * from`: the names of the module below, a name the file sets itself winning. */
function addStar(names: Map<string, Binding>, file: string, entry: ExportEntry): void {
  const from = target(file, entry.moduleRequest?.value ?? '');
  if (!from.startsWith('/')) throw new Error(`${relative(ROOT, file)}: export * from a package`);
  for (const [name, binding] of namesOf(from)) if (!names.has(name)) names.set(name, binding);
}

/** The names a module exports, resolved through every barrel below it. */
export function namesOf(file: string): ReadonlyMap<string, Binding> {
  const known = moduleExports.get(file);
  if (known !== undefined) return known;
  const names = new Map<string, Binding>();
  moduleExports.set(file, names);
  const parsed = parsedSource(file);
  for (const declaration of parsed.module.staticExports) {
    for (const entry of declaration.entries) {
      if (entry.importName.kind === 'AllButDefault') addStar(names, file, entry);
      else if (entry.exportName.name !== null)
        names.set(entry.exportName.name, entryBinding(file, parsed, entry));
    }
  }
  return names;
}
