import { loadFiles } from '../../format/load-files.ts';
import { errorIn } from '../../format/validate/finding.ts';
import type { PluginFiles } from '../../ports/index.ts';
import { componentsOnly } from './components-only.ts';
import { validateMarketplaceFolder } from './marketplace-target.ts';
import { MANIFEST_FILE, validatePluginFolder } from './plugin-target.ts';
import type { ValidationReport } from './report.ts';

export interface ValidatePluginInput {
  /** Read access to the folder: its root is what `claude plugin validate <dir>` is given. */
  readonly files: PluginFiles;
  /** What the report calls the folder when it has nothing to validate; default `.`. */
  readonly label?: string;
  readonly signal?: AbortSignal;
}

const MARKETPLACE_FILE = '.claude-plugin/marketplace.json';
const NO_MANIFEST =
  'No manifest found in directory. Expected .claude-plugin/marketplace.json or .claude-plugin/plugin.json';

/**
 * `claude plugin validate <dir>` over a folder (docs/API.md, "Validating"): the marketplace when the
 * folder has `.claude-plugin/marketplace.json` (and its plugin too when it has a manifest), else the
 * plugin, else a bare skills tree; a folder with none of them is an error, and so is one that does not exist. Findings are in the shape
 * the official CLI of the same release reports (docs/SPEC.md, "Sources of truth"). Never throws.
 */
export async function validatePlugin(input: ValidatePluginInput): Promise<ValidationReport> {
  const { signal } = input;
  const files = loadFiles(input.files, signal);
  const label = input.label ?? '.';
  if (await isMissing(files, signal)) {
    return { target: 'none', issues: [errorIn(label, 'file', `File not found: ${label}`)] };
  }
  const [marketplace, plugin] = await Promise.all([
    files.exists(MARKETPLACE_FILE, signal),
    files.exists(MANIFEST_FILE, signal),
  ]);
  if (marketplace) return marketplaceReport(files, plugin, signal);
  if (plugin) return { target: 'plugin', issues: await validatePluginFolder(files, {}, signal) };
  const components = await componentsOnly({ files, label, ...(signal && { signal }) });
  if (components !== undefined) return { target: 'components', issues: components };
  return { target: 'none', issues: [errorIn(label, 'directory', NO_MANIFEST)] };
}

/** The folder does not exist: not even an empty one. */
async function isMissing(files: PluginFiles, signal?: AbortSignal): Promise<boolean> {
  return (
    (await files.stat('.', signal)) === undefined && (await files.list('.', signal)) === undefined
  );
}

/** The marketplace, and the plugin at its root too when the folder has a manifest. */
async function marketplaceReport(
  files: PluginFiles,
  hasPlugin: boolean,
  signal?: AbortSignal,
): Promise<ValidationReport> {
  const { issues, official } = await validateMarketplaceFolder(files, signal);
  const own = hasPlugin ? await validatePluginFolder(files, { official }, signal) : [];
  return { target: 'marketplace', issues: [...issues, ...own] };
}
