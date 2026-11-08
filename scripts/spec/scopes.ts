import { CORE_SCOPES } from './scope-core.ts';
import { ERROR_SCOPES } from './scope-errors.ts';
import { HOST_SCOPES } from './scope-host.ts';
import { MCP_SCOPES } from './scope-mcp.ts';
import { MOD_SCOPES } from './scope-mods.ts';
import { PLUGIN_SCOPES_MORE } from './scope-plugins-more.ts';
import { PLUGIN_SCOPES } from './scope-plugins.ts';
import { SETTINGS_SCOPES } from './scope-settings.ts';
import { UI_SCOPES } from './scope-ui.ts';
import type { PageScope } from './scope.ts';

/** Every page the audit classifies, section by section (scripts/spec/scope.ts). */
export const SCOPES: readonly PageScope[] = [
  ...PLUGIN_SCOPES,
  ...PLUGIN_SCOPES_MORE,
  ...MOD_SCOPES,
  ...CORE_SCOPES,
  ...MCP_SCOPES,
  ...SETTINGS_SCOPES,
  ...UI_SCOPES,
  ...HOST_SCOPES,
  ...ERROR_SCOPES,
];
