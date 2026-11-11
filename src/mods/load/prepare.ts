import type { PluginIssue } from '../../format/issues.ts';
import { readHooksJsonModules, resolveTypesPath } from '../../format/mod-files.ts';
import { readManifest } from '../../format/manifest.ts';
import { locate, locateContext } from '../../format/locate.ts';
import type { PluginManifest } from '../../format/manifest-schema.ts';
import type { JsonObject } from '../../foundation/index.ts';
import type { PluginFiles } from '../../ports/index.ts';
import { noRunOutput, scanSourceOf, type RunOutput } from './compile-output.ts';
import { compileModule } from './loader-io.ts';
import { readJson, type JsonRead } from '../../format/read-json.ts';
import type { LoadedMod, LoaderEnv, ModPlugin } from './loader.ts';
import { modOptions } from './options.ts';
import { scanHooksModule, type ModScan } from './scan/index.ts';
import { declaredState, missingTypes, readTypes } from './types-decl.ts';

/** Preparing one hooks module: its manifest, its compiled code, its scan and its options, or the line that says why not. */

/** What loading a plugin came to: the mod, or the line that says why not; neither for a plugin with no hooks module. */
export type LoadLineKind = 'did-not-load' | 'refused-by-mod';

export interface LoadOutcome {
  readonly mod?: LoadedMod;
  readonly line?: string;
  /** Which of the two lines of troubleshoot.md `line` is: the module did not load, or another mod refused it. */
  readonly kind?: LoadLineKind;
}

export interface Prepared {
  readonly manifest: PluginManifest;
  readonly entry: string;
  /** What the engine runs, in the format the compiler chose. */
  readonly run: RunOutput;
  readonly scan: ModScan;
  readonly options: JsonObject;
}

/** A file's JSON value; a missing or unparsable file is no value, as the readers below take it. */
const valueOf = (read: JsonRead): unknown => ('value' in read ? read.value : undefined);

export const messages = (issues: readonly PluginIssue[]): string =>
  issues.map((issue) => issue.message).join('; ');

const firstError = (issues: readonly PluginIssue[]): PluginIssue[] =>
  issues.filter((issue) => issue.severity === 'error');

export const didNotLoad = (name: string, reason: string): LoadOutcome => ({
  line: `${name}: hooks module did not load: ${reason}`,
  kind: 'did-not-load',
});

/**
 * Why a mod's component path may not be read: a link on it or a folder above it leads outside the
 * plugin (`locate`, the one containment check); `undefined` when it may, or nothing is declared.
 */
async function contained(
  env: LoaderEnv,
  files: PluginFiles,
  component: 'hooks' | 'types',
  written: string | undefined,
): Promise<string | undefined> {
  if (written === undefined) return undefined;
  const { issue } = await locate(locateContext(files, { signal: env.signal }), component, written);
  return issue?.message;
}

/**
 * The static scan of the compiled module, with the types file it needs. The rules are the ones
 * `claude plugin validate` checks: the loader runs "the same static analysis".
 */
async function scanned(
  env: LoaderEnv,
  files: PluginFiles,
  manifest: PluginManifest,
  module: { readonly entry: string; readonly code: string },
): Promise<{ readonly scan: ModScan } | { readonly problem: string }> {
  const typesPath = resolveTypesPath(manifest);
  const placed = await contained(env, files, 'types', manifest.types);
  if (placed !== undefined) return { problem: placed };
  const types = await readTypes(files, typesPath, env.signal);
  const scan = scanHooksModule(module.code, module.entry, {
    isEntry: true,
    directory: module.entry.slice(0, Math.max(module.entry.lastIndexOf('/'), 0)),
    ...(types === undefined ? {} : { declaredState: declaredState(types) }),
  });
  const errors = firstError(scan.issues);
  if (errors.length > 0) return { problem: messages(errors) };
  const needed = types === undefined ? missingTypes(scan, module.entry, typesPath) : undefined;
  return needed === undefined ? { scan } : { problem: needed };
}

/** The manifest, the module the plugin names, its compiled code, its scan and its options; or why not. */
export async function prepare(env: LoaderEnv, plugin: ModPlugin): Promise<Prepared | LoadOutcome> {
  const { candidate, files } = plugin;
  const manifestRead = readManifest(
    valueOf(await readJson(files, '.claude-plugin/plugin.json', env.signal)),
  );
  if (!manifestRead.manifest) return didNotLoad(candidate.name, messages(manifestRead.issues));
  const modules = readHooksJsonModules(
    valueOf(await readJson(files, 'hooks/hooks.json', env.signal)),
  );
  const bad = firstError(modules.issues);
  if (bad.length > 0) return didNotLoad(candidate.name, messages(bad));
  if (modules.entry === undefined) return {};
  const escaped = await contained(env, files, 'hooks', modules.entry);
  if (escaped !== undefined) return didNotLoad(candidate.name, escaped);
  const compiled = await compileModule(env, files, modules.entry);
  if (compiled.run === undefined) {
    return didNotLoad(candidate.name, noRunOutput(compiled, modules.entry));
  }
  const source = scanSourceOf(compiled, modules.entry);
  if ('problem' in source) return didNotLoad(candidate.name, source.problem);
  const checked = await scanned(env, files, manifestRead.manifest, {
    entry: modules.entry,
    code: source.code,
  });
  if ('problem' in checked) return didNotLoad(candidate.name, checked.problem);
  const { scan } = checked;
  const fitted = modOptions(
    candidate.id,
    manifestRead.manifest.userConfig ?? {},
    env.savedOptions(candidate.id),
  );
  if (fitted.issues.length > 0) return didNotLoad(candidate.name, messages(fitted.issues));
  return {
    manifest: manifestRead.manifest,
    entry: modules.entry,
    run: compiled.run,
    scan,
    options: fitted.options,
  };
}

export const isPrepared = (value: Prepared | LoadOutcome): value is Prepared => 'run' in value;
