/** `strictPluginOnlyCustomization`: which kinds are locked and which origins still load. */
export { type PreapprovalSkill, type PreapprovalSource } from './preapproval.ts';
export { createCustomizationPolicy, MCP_ADD_REFUSAL, type CustomizationPolicy } from './policy.ts';
export {
  type AgentsOrigin,
  type HooksOrigin,
  type McpOrigin,
  type OriginOf,
  type SkillsOrigin,
} from './sources.ts';
export { readSurfaceLocks, type SurfaceLocks } from './surfaces.ts';
