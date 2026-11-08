import { error, type PluginIssue } from '../format/issues.ts';
import type { PluginSourceOf } from '../format/marketplace/types.ts';

/** The `mode` of a `command` source (plugins/marketplace-reference.md, "Copy mode and link mode"). */

/** Which `mode` Windows refuses. */
export const LINKS_NEED_POSIX: { readonly [M in PluginSourceOf<'command'>['mode']]: boolean } = {
  copy: false,
  link: true,
};

/** "Claude Code refuses to install a link-mode plugin on Windows. Declare `"mode": "copy"` there." */
export const linkOnWindowsIssue = (): PluginIssue =>
  error(
    'source.mode',
    'A link-mode plugin cannot be installed on Windows. Declare "mode": "copy" there',
  );
