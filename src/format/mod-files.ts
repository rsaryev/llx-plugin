import { error, type PluginIssue } from './issues.ts';

/**
 * The files of a mod (plugins/mods/reference.md, "Files"): `hooks/hooks.json` names one hooks
 * module in `modules`, the module has one of eight extensions, `*.test.ts` and `*.test.tsx` are
 * tests, and `types` in the manifest may name the declaration file. Pure readers: a problem is a
 * `PluginIssue`, never a throw.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The extensions a hooks module may have ("Named `.js`, `.mjs`, `.cjs`, `.jsx`, `.ts`, `.mts`, `.cts`, or `.tsx`"). */
export const HOOKS_MODULE_EXTENSIONS = [
  '.js',
  '.mjs',
  '.cjs',
  '.jsx',
  '.ts',
  '.mts',
  '.cts',
  '.tsx',
] as const;

export const isHooksModuleName = (path: string): boolean =>
  HOOKS_MODULE_EXTENSIONS.some((extension) => path.endsWith(extension));

/** Tests `claude plugin test` runs: "files whose names end in `.test.ts` or `.test.tsx`". */
export const isModTestFile = (path: string): boolean =>
  path.endsWith('.test.ts') || path.endsWith('.test.tsx');

/** Where the declarations are when the manifest says nothing ("`types/index.d.ts`, unless `types` in the manifest names another path"). */
export const DEFAULT_TYPES_PATH = 'types/index.d.ts';

/** The declaration file of a mod: the manifest's `types` path, else `types/index.d.ts`; relative to the plugin folder, `/`-separated. */
export function resolveTypesPath(manifest: { readonly types?: string | undefined }): string {
  const declared = manifest.types;
  if (declared === undefined || declared === '') return DEFAULT_TYPES_PATH;
  return declared.replace(/^\.\//, '');
}

export interface HooksModules {
  /** The one module path, relative to the plugin folder (`hooks/` joined to the entry), or `undefined` when the file names none. */
  readonly entry?: string;
  /** The path as written in `hooks.json`, relative to that file. */
  readonly written?: string;
  readonly issues: readonly PluginIssue[];
}

const PATH = 'hooks/hooks.json';

/** `./register.js` read from `hooks/` as a path from the plugin folder, or `undefined` when it leaves the folder. */
function fromPluginRoot(written: string): string | undefined {
  const parts = ['hooks', ...written.split('/')];
  const kept: string[] = [];
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (kept.pop() === undefined) return undefined;
    } else kept.push(part);
  }
  return kept.join('/');
}

function moduleIssues(value: unknown): PluginIssue[] {
  if (typeof value !== 'string' || value === '') {
    return [error(`${PATH}:modules[0]`, 'A hooks module path must be a non-empty string')];
  }
  if (fromPluginRoot(value) === undefined) {
    return [error(`${PATH}:modules[0]`, `"${value}" leaves the plugin folder`)];
  }
  if (!isHooksModuleName(value)) {
    return [
      error(
        `${PATH}:modules[0]`,
        `"${value}" is not a hooks module: name it ${HOOKS_MODULE_EXTENSIONS.join(', ')}`,
      ),
    ];
  }
  return [];
}

/**
 * Reads `modules` of `hooks/hooks.json`: "an array with one path, relative to this file" (`"modules":
 * ["./register.js"]`). A file with no `modules` key holds no mod (a mod-less plugin is valid), and
 * the entry is `undefined`; one with the wrong number of paths, or a path of the wrong kind, is an
 * error. Settings hooks under `hooks` are read by `readHooksFile`.
 */
export function readHooksJsonModules(raw: unknown): HooksModules {
  if (!isRecord(raw)) return { issues: [error(PATH, 'The hooks file must be a JSON object')] };
  if (!('modules' in raw)) return { issues: [] };
  const modules = raw.modules;
  if (!Array.isArray(modules)) {
    return { issues: [error(`${PATH}:modules`, '"modules" must be an array with one path')] };
  }
  if (modules.length !== 1) {
    return {
      issues: [
        error(
          `${PATH}:modules`,
          `"modules" must list exactly one hooks module, found ${modules.length}`,
        ),
      ],
    };
  }
  const written: unknown = modules[0];
  const issues = moduleIssues(written);
  const entry = typeof written === 'string' ? fromPluginRoot(written) : undefined;
  if (issues.length > 0 || entry === undefined || typeof written !== 'string') return { issues };
  return { entry, written, issues };
}
