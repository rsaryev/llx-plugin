/**
 * @rsaryev/claude-plugin-kit — add Claude Code plugin support to any agent (docs/API.md).
 *
 * Claude Code's own shapes are re-exported from the official Agent SDK types; the kit adds the
 * runtime that reads and runs plugins through ports the host implements.
 */
export * from './format/index.ts';
export { EFFORT_LEVELS } from './protocol/effort.ts';
export { HOOK_EVENTS } from './protocol/hook-events.ts';
export type {
  EventWithSpecificOutput,
  HookInputOf,
  HookSpecificOutput,
  HookSpecificOutputOf,
} from './protocol/hook-events.ts';
export { HOOK_HANDLER_TYPES } from './protocol/hook-config.ts';
export type {
  HookHandler,
  HookHandlerOf,
  HookHandlerType,
  HookMatcherGroup,
  HooksSettings,
} from './protocol/hook-config.ts';
export type * from './protocol/official.ts';
export type * from './ports/index.ts';
export * from './loading/index.ts';
export * from './rules/index.ts';
export {
  PERMISSION_BEHAVIORS,
  PERMISSION_MODES,
  normalizePermissionMode,
} from './protocol/permission-modes.ts';
export {
  DOCUMENTED_TOOLS,
  REMOVED_TOOLS,
  SDK_ONLY_TOOLS,
  type DocumentedTool,
  type RemovedTool,
  type SdkOnlyTool,
} from './protocol/tool-names.ts';
export type * from './protocol/official-tools.ts';
export {
  readOutputStyle,
  type OutputStyle,
  type OutputStyleContext,
  type OutputStyleRead,
} from './format/output-style.ts';
export {
  BUILTIN_OUTPUT_STYLES,
  DEFAULT_OUTPUT_STYLE_ID,
  includeCodingInstructions,
  listOutputStyles,
  resolveOutputStyle,
  type OutputStyleChoice,
  type OutputStyleRequest,
  type PromptKind,
  type StyleSelection,
} from './skills/output-style-select.ts';
export { readSkill, type SkillRead } from './format/skill.ts';
export { resolveSkillName, type SkillName } from './format/skill-name.ts';
export {
  FIELD_READERS,
  SKILL_FIELDS,
  escapeAngleBrackets,
  firstContentLine,
  readInvocable,
  readSkillFields,
  type InvocableRead,
  type SkillField,
} from './format/skill-fields.ts';
export type { FieldOutcome, FieldReader, SkillFieldValues } from './format/skill-field-readers.ts';
export {
  ORIGIN_TRAITS,
  SKILL_SHELLS,
  type Command,
  type InvocableFrontmatter,
  type OriginTraits,
  type Skill,
  type SkillLayout,
  type SkillOrigin,
  type SkillOriginKind,
  type SkillShell,
} from './format/skill-types.ts';
