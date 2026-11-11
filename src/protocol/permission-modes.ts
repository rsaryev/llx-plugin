import type { PermissionBehavior, PermissionMode } from './official.ts';
import type { Assert, Equal } from './type-equality.ts';

/**
 * The permission modes of permissions.md ("Permission modes"), tied to the official
 * `PermissionMode` union: an SDK update that adds or drops a mode fails the typecheck here.
 */
export const PERMISSION_MODES = [
  'default',
  'acceptEdits',
  'bypassPermissions',
  'plan',
  'dontAsk',
  'auto',
] as const satisfies readonly PermissionMode[];

/** The three rule behaviours of permissions.md ("Manage permissions"): allow, ask and deny. */
export const PERMISSION_BEHAVIORS = [
  'allow',
  'deny',
  'ask',
] as const satisfies readonly PermissionBehavior[];

/** @public A compile-time drift guard: the typecheck fails when the SDK changes the union. */
export type PermissionModesMatchSdk = Assert<
  Equal<(typeof PERMISSION_MODES)[number], PermissionMode>
>;

/** @public A compile-time drift guard: the typecheck fails when the SDK changes the union. */
export type PermissionBehaviorsMatchSdk = Assert<
  Equal<(typeof PERMISSION_BEHAVIORS)[number], PermissionBehavior>
>;

/**
 * Other spellings of a mode: the `default` row of permissions.md ("Permission modes") says it is
 * "Labeled Manual in the CLI … and Claude Code accepts `manual` as an alias".
 */
const PERMISSION_MODE_ALIASES: ReadonlyMap<string, PermissionMode> = new Map([
  ['manual', 'default'],
]);

/** A mode name as Claude Code accepts it: a mode itself or one of its aliases; else `undefined`. */
export function normalizePermissionMode(raw: string): PermissionMode | undefined {
  return PERMISSION_MODES.find((mode) => mode === raw) ?? PERMISSION_MODE_ALIASES.get(raw);
}
