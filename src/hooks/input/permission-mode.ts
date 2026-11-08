import { normalizePermissionMode } from '../../protocol/permission-modes.ts';
import type { PermissionMode } from '../../protocol/official.ts';

/**
 * The `permission_mode` a hook receives (hooks.md, "Common input fields"): one of `"default"`,
 * `"plan"`, `"acceptEdits"`, `"auto"`, `"dontAsk"` or `"bypassPermissions"`. "The mode labeled
 * **Manual** arrives as `"default"`, never as `"manual"`, so scripts that match `"default"` keep
 * working." A host that labels its mode Manual passes it as it is called; a text that names no
 * mode yields `undefined`.
 */
export function hookPermissionMode(mode: string): PermissionMode | undefined {
  return normalizePermissionMode(mode);
}
