import type { PolicyView } from '../view.ts';

/**
 * Judgment (spec/judgments.md): the docs say the organization's text is "added" and "appended" and
 * name no separator; a blank line keeps it apart from the standard warning.
 */
const TRUST_MESSAGE_JOINER = '\n\n';
/** plugins/security.md § Trust warning before you install, verbatim. */
const STANDARD_TRUST_WARNING =
  "Make sure you trust a plugin before installing, updating, or using it. Anthropic does not control what MCP servers, files, or other software are included in plugins and cannot verify that they will work as intended or that they won't change. See each plugin's homepage for more information.";

/**
 * The trust warning `/plugin` shows before a plugin installs (settings-reference.md,
 * `pluginTrustMessage`; plugins/security.md, "Trust warning before you install"). The published
 * warning is the default; a host can supply its own wording, unchanged and first.
 * Only managed settings carry the key. An empty or blank message adds nothing (a judgment).
 */
export function trustWarning(view: PolicyView, standard = STANDARD_TRUST_WARNING): string {
  const message = view.get('pluginTrustMessage');
  if (message === undefined || message.trim() === '') return standard;
  return `${standard}${TRUST_MESSAGE_JOINER}${message}`;
}
