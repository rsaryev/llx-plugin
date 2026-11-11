import type { RenderSite } from '../../../protocol/mods-ui-names.ts';

/**
 * The line for an error the app hit while drawing a tree or a site's props (troubleshoot.md, "A
 * `ui.render` line says `threw while drawn`"): `first-mod: ui.render (ToolUse) threw while drawn:
 * <error>; the engine drew its own`. The ending says the site shows Claude Code's usual content.
 */
export const drawFaultLine = (plugin: string, site: RenderSite, error: string): string =>
  `${plugin}: ui.render (${site}) threw while drawn: ${error}; the engine drew its own`;
