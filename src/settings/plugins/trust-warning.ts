import type { PolicyView } from '../view.ts';

/**
 * Judgment (spec/judgments.md): the docs say the organization's text is "added" and "appended" and
 * name no separator; a blank line keeps it apart from the standard warning.
 */
export const TRUST_MESSAGE_JOINER = '\n\n';

/**
 * The trust warning `/plugin` shows before a plugin installs (settings-reference.md,
 * `pluginTrustMessage`; plugins/org.md, "Control matrix"). The standard text is the host's, since the
 * docs do not quote it, and comes back unchanged and first; a managed message is appended to it.
 * Only managed settings carry the key. An empty or blank message adds nothing (a judgment).
 */
export function trustWarning(view: PolicyView, standard: string): string {
  const message = view.get('pluginTrustMessage');
  if (message === undefined || message.trim() === '') return standard;
  return `${standard}${TRUST_MESSAGE_JOINER}${message}`;
}
