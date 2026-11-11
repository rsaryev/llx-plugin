import { error, warning, type PluginIssue } from '../issues.ts';
import { CONTROL_OR_BIDI } from '../names.ts';

/**
 * Each part of a plugin id, `plugin@marketplace` (plugins/marketplace-reference.md, "Validation
 * messages"; plugins/troubleshooting.md, "Cannot add marketplace"): letters a-z and A-Z, digits,
 * `.`, `_` and `-`, starting with a letter or digit. Shared by entries, rename targets and
 * dependencies, so the rule exists once.
 */
export const PLUGIN_ID_PART = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export const isPluginIdPart = (name: string): boolean => PLUGIN_ID_PART.test(name);

export type IdPart = 'marketplace' | 'plugin';

/** The control characters the docs name ("an escape or a newline") and Unicode's bidirectional-formatting set. */

/** Marketplace `name` also may not hold a path separator or `..`, or be `.` (the "Top-level fields" `name` row). */
const MARKETPLACE_PATH = /[/\\]|\.\./;
const MARKETPLACE_PATH_MESSAGE =
  'Marketplace name cannot contain path separators (/ or \\), ".." sequences, or be "."';

const LABEL: { readonly [P in IdPart]: string } = { marketplace: 'Marketplace', plugin: 'Plugin' };
const KEBAB_EXAMPLE: { readonly [P in IdPart]: string } = {
  marketplace: 'my-marketplace',
  plugin: 'my-plugin',
};

export const INSTALL_RULE =
  'Each part of a plugin id (plugin@marketplace) may use only the letters a-z and A-Z, digits, ".", "_" and "-", and must start with a letter or digit.';
const INSTALL_MESSAGE: { readonly [P in IdPart]: (name: string) => string } = {
  marketplace: (name) =>
    `Claude Code cannot install plugins from marketplace "${name}". ${INSTALL_RULE} Change the marketplace's "name".`,
  plugin: (name) =>
    `Claude Code cannot install plugin "${name}". ${INSTALL_RULE} Change this entry's "name".`,
};

/**
 * What a marketplace or entry `name` breaks before it can be part of an id: a space, a control or
 * bidirectional-formatting character, for a marketplace a path separator or `..`, the grammar. Each rule that fires is reported (the docs list
 * them as separate rows), on `path`. An empty name is left to the reader's own "must have a name".
 */
export function pluginIdIssues(part: IdPart, name: string, path: string): PluginIssue[] {
  if (name === '') return [];
  const found: PluginIssue[] = [];
  if (name.includes(' ')) {
    found.push(
      error(
        path,
        `${LABEL[part]} name cannot contain spaces. Use kebab-case (e.g., "${KEBAB_EXAMPLE[part]}")`,
      ),
    );
  }
  if (CONTROL_OR_BIDI.test(name)) {
    found.push(
      error(
        path,
        `${LABEL[part]} name cannot contain control or bidirectional-formatting characters`,
      ),
    );
  }
  if (part === 'marketplace' && (MARKETPLACE_PATH.test(name) || name === '.')) {
    found.push(error(path, MARKETPLACE_PATH_MESSAGE));
  }
  if (!isPluginIdPart(name)) found.push(error(path, INSTALL_MESSAGE[part](name)));
  return found;
}

const DESKTOP_MAX_LENGTH = 128;
/** What the oracle adds about the sync (docs/SPEC.md, "Sources of truth"; spec/judgments.md). */
const DESKTOP_DROPS: { readonly [P in IdPart]: string } = {
  marketplace:
    'The Claude Desktop managed marketplace sync (allowedPluginMarketplaces) will reject the whole marketplace.',
  plugin:
    'The Claude Desktop managed marketplace sync (allowedPluginMarketplaces) will drop this entry.',
};
/** Claude Desktop's managed marketplace sync rejects these "in any casing" (troubleshooting.md). */
const DESKTOP_RESERVED = new Set(['org', 'org-provisioned', 'unknown']);

/** Warnings for names Claude Desktop rejects: the reserved marketplace names and the 128-character grammar. */
export function desktopNameIssues(part: IdPart, name: string, path: string): PluginIssue[] {
  if (name === '') return [];
  const found: PluginIssue[] = [];
  if (part === 'marketplace' && DESKTOP_RESERVED.has(name.toLowerCase())) {
    found.push(
      warning(
        path,
        `Marketplace name "${name}" is reserved in Claude Desktop. Claude Code accepts it, but the Claude Desktop managed marketplace sync (allowedPluginMarketplaces) will reject the whole marketplace.`,
      ),
    );
  }
  if (!isPluginIdPart(name) || name.length > DESKTOP_MAX_LENGTH) {
    found.push(
      warning(
        path,
        `${LABEL[part]} name "${name}" is not accepted by Claude Desktop (letters, digits, ".", "_", "-"; must start alphanumeric; max ${DESKTOP_MAX_LENGTH} chars). ${DESKTOP_DROPS[part]}`,
      ),
    );
  }
  return found;
}

/** A `<plugin>` reference: `name`, or `name@marketplace` (plugins/cli-reference.md, "claude plugin commands"). */
export interface PluginRef {
  readonly name: string;
  /** Absent for a bare name. */
  readonly marketplace?: string;
}

/** `name` or `name@marketplace`; any other number of `@`, or an empty part, is no reference. */
export function parsePluginRef(text: string): PluginRef | undefined {
  const parts = text.split('@');
  const [name, marketplace] = parts;
  if (name === undefined || name === '' || parts.length > 2) return undefined;
  if (parts.length === 1) return { name };
  return marketplace === undefined || marketplace === '' ? undefined : { name, marketplace };
}

/** The name part of a plugin id (`formatter` of `formatter@my-marketplace`); a bare name is its own. */
export const pluginNameOf = (id: string): string => id.split('@')[0] ?? id;
