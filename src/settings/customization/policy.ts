import type { PluginOnlySurface } from '../../protocol/settings-keys.ts';
import { applyParentRules, type ParentSettingsContext } from '../managed/parent.ts';
import { createMarketplaceGate, type SkillsDirVerdict } from '../marketplaces/gate.ts';
import type { PolicyView } from '../view.ts';
import { allowedToolsPreapproved, type PreapprovalSkill } from './preapproval.ts';
import { loads, type OriginOf } from './sources.ts';
import { readSurfaceLocks } from './surfaces.ts';

/**
 * What `claude mcp add` says while the `mcp` surface is locked: the message errors.md quotes for
 * "Cannot add MCP server when managed settings allow only plugin servers".
 */
const MCP_ADD_REFUSAL =
  "Cannot add MCP server: your organization's managed settings allow only MCP servers that plugins provide. Install a plugin that provides this server, or ask your administrator to make it available.";

/**
 * `strictPluginOnlyCustomization` as one object over a view (docs/API.md, "Settings"): a host's
 * discovery of skills, agents, hooks and MCP servers asks `loads(surface, origin)` per candidate.
 */
export interface CustomizationPolicy {
  /** The kinds of customization the lock covers. */
  readonly locked: ReadonlySet<PluginOnlySurface>;
  /** Names in the list that no kind has: they lock nothing, and the status note counts them. */
  readonly unknownSurfaceNames: number;
  /** Whether a customization of `surface` from `origin` loads. */
  loads<S extends PluginOnlySurface>(surface: S, origin: OriginOf[S]): boolean;
  /** Whether skills-directory plugins load, and which key stops them when they do not. */
  skillsDirPlugins(): SkillsDirVerdict;
  /** Whether the skill's `allowed-tools` pre-approval holds. */
  skillAllowedToolsPreapproved(skill: PreapprovalSkill): boolean;
  /** The refusal of `claude mcp add` while MCP servers are locked to plugins; `undefined` otherwise. */
  readonly mcpAddRefusal: string | undefined;
}

/** The customization policy over a view the parent rules were already applied to (`resolvePolicy`). */
export function customizationOver(effective: PolicyView): CustomizationPolicy {
  const { locked, unknownNames } = readSurfaceLocks(effective.get('strictPluginOnlyCustomization'));
  const gate = createMarketplaceGate(effective);
  return {
    locked,
    unknownSurfaceNames: unknownNames,
    loads: (surface, origin) => loads(locked, surface, origin),
    skillsDirPlugins: () => gate.skillsDirectoryPlugins(),
    skillAllowedToolsPreapproved: (skill) => allowedToolsPreapproved(locked, skill),
    mcpAddRefusal: locked.has('mcp') ? MCP_ADD_REFUSAL : undefined,
  };
}

/**
 * The key passes the parent filter (claude-apps-gateway.md), but a parent is still ignored where an
 * administrator deploys managed settings and does not let an embedding host add policy.
 */
export const createCustomizationPolicy = (
  view: PolicyView,
  context: ParentSettingsContext,
): CustomizationPolicy => customizationOver(applyParentRules(view, context));
