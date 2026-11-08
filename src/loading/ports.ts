/**
 * The loading stream's own port (docs/ARCHITECTURE.md, "Ports"): it lives here, not in `src/ports/`,
 * because the stream owns it.
 */

/**
 * Whether the user accepted the workspace trust dialog for a folder (permissions.md, "Project allow
 * rules and workspace trust"). The host keeps the answer (`projects["<path>"].hasTrustDialogAccepted`
 * in `~/.claude.json`, or the session's memory for the home directory); `path` is the key
 * `workspaceTrustKey` names, so the host never decides what a key is. Reading it is an effect: the
 * answer is a promise, and a host that cannot read it answers `false`.
 */
export interface WorkspaceTrust {
  isFolderTrusted(path: string, signal?: AbortSignal): Promise<boolean>;
}
