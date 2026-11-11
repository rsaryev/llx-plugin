import type { ValidationAdvice } from './validate-run.ts';

/**
 * The advice on a README (plugins/cli-reference.md, "Advice on the README"): a plugin's README with
 * no line that installs the plugin from a marketplace gets the line to add. It is neither an error
 * nor a warning and never changes the verdict.
 */

const PLACEHOLDER = '<owner>/<repo>';

/** `plugin install` or `plugin i`, in the `/plugin` and `claude plugin` spellings, with what follows on the line. */
const INSTALL = /\bplugin\s+(?:install|i)\s+(.*)$/;

/**
 * Whether a line is an install line that counts: "`<plugin>@<marketplace>`" after the command, or
 * "the plugin's name and `--marketplace <source>`".
 */
function countsAsInstall(rest: string, plugin: string): boolean {
  const words = rest.split(/\s+/).filter((word) => word !== '');
  if (words.some((word) => word.startsWith(`${plugin}@`) && word.length > plugin.length + 1)) {
    return true;
  }
  const flag = words.indexOf('--marketplace');
  return words.includes(plugin) && flag !== -1 && words[flag + 1] !== undefined;
}

/** Whether the README already holds a line that installs `plugin` from a marketplace. */
export function readmeInstallsPlugin(readme: string, plugin: string): boolean {
  return readme.split('\n').some((line) => {
    const rest = INSTALL.exec(line)?.[1];
    return rest !== undefined && countsAsInstall(rest, plugin);
  });
}

/**
 * The advice for a README that lacks the line, or none. `source` is the marketplace's source
 * (`owner/repo`); without one the line holds `<owner>/<repo>`, which "pasting it unchanged doesn't
 * clear".
 */
export function readmeAdvice(input: {
  readonly file: string;
  readonly plugin: string;
  readonly readme: string;
  readonly source?: string;
}): ValidationAdvice | undefined {
  if (readmeInstallsPlugin(input.readme, input.plugin)) return undefined;
  return {
    file: input.file,
    message: `This README has no line that installs "${input.plugin}" from a marketplace. Add the install line, which works in one step on Claude Code 2.1.275 or later.`,
    installLine: `/plugin install ${input.plugin} --marketplace ${input.source ?? PLACEHOLDER}`,
  };
}

/** Whether an advice line still holds the placeholder, so pasting it does not clear the advice. */
export const adviceNeedsSource = (advice: ValidationAdvice): boolean =>
  advice.installLine.includes(PLACEHOLDER);

/** The `Advice` block as the page prints it, or nothing when there is none. */
export function renderAdvice(advice: readonly ValidationAdvice[]): readonly string[] {
  if (advice.length === 0) return [];
  return [
    'ℹ Advice (does not change the verdict):',
    '',
    ...advice.flatMap((each) => [`  ❯ ${each.file}: ${each.message}`, `      ${each.installLine}`]),
  ];
}

const GITHUB =
  /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/;

/**
 * The marketplace source Claude Code fills in from "the `origin` remote of the `.git` directory at the
 * top of" the validated directory; `undefined` when the remote is not one it can use (judgment,
 * spec/judgments.md: a GitHub remote is the one the install line's `owner/repo` form names).
 */
export const sourceFromOrigin = (remote: string | undefined): string | undefined =>
  remote === undefined ? undefined : GITHUB.exec(remote.trim())?.[1];
