/**
 * The notice a terminal session shows under the HIPAA configuration, where the built-in `auto` default
 * does not apply (permission-modes.md, "Permission modes with the HIPAA configuration", verbatim).
 */
export const HIPAA_AUTO_NOTICE =
  "Auto mode isn't the default for your organization · Shift+Tab to switch";

/** What decides the notices of a start. */
export interface NoticeFacts {
  /** The HIPAA configuration is applied and the session is eligible for it. */
  readonly hipaa: boolean;
  /** A terminal session. */
  readonly terminal: boolean;
  /** Nothing chose the mode: no flag and no `defaultMode`. */
  readonly builtIn: boolean;
}

/**
 * What a session shows at its start, as text: under the HIPAA configuration "A terminal session also
 * shows" the notice when nothing else chose the mode, "and the VS Code extension shows no notice". The
 * first-time notice of the built-in `auto` default has no quoted text and needs a record of earlier
 * starts, so the host shows it (spec/judgments.md).
 */
export const startNotices = (facts: NoticeFacts): readonly string[] =>
  facts.hipaa && facts.terminal && facts.builtIn ? [HIPAA_AUTO_NOTICE] : [];
