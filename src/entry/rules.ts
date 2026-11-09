/** `@rsaryev/claude-plugin-kit/rules`: Permission rules: syntax, matching, precedence and the permission modes (docs/API.md, "Permission rules"). */
export * from '../rules/index.ts';
export {
  PERMISSION_BEHAVIORS,
  PERMISSION_MODES,
  normalizePermissionMode,
} from '../protocol/permission-modes.ts';
