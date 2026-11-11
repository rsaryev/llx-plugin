import type { HookInputOf } from '../../protocol/hook-events.ts';
import type { HookEvent } from '../../protocol/official.ts';
import type { Assert, Equal } from '../../protocol/type-equality.ts';

/**
 * The values a matcher can name, per event, as hooks.md lists them in each event's section and in
 * "Matcher patterns". Where the SDK types the field as a union, the list is asserted equal to it, so
 * an SDK release that adds a value fails the typecheck here.
 */

const SESSION_START_SOURCES = ['startup', 'resume', 'clear', 'compact', 'fork'] as const;
const SETUP_TRIGGERS = ['init', 'maintenance'] as const;
/** `bypass_permissions_disabled` is documented as removed in v2.1.234: "Drop it from your matchers". */
const SESSION_END_REASONS = ['clear', 'resume', 'logout', 'prompt_input_exit', 'other'] as const;
const COMPACT_TRIGGERS = ['manual', 'auto'] as const;
const CONFIG_CHANGE_SOURCES = [
  'user_settings',
  'project_settings',
  'local_settings',
  'policy_settings',
  'skills',
] as const;
const DIRECTORY_ADDED_SOURCES = ['slash_command', 'register_repo_root'] as const;
const INSTRUCTIONS_LOAD_REASONS = [
  'session_start',
  'nested_traversal',
  'path_glob_match',
  'include',
  'compact',
] as const;
/** The SDK types `notification_type` as a plain string; these are the documented values. */
const NOTIFICATION_TYPES = [
  'permission_prompt',
  'idle_prompt',
  'auth_success',
  'auth_storage_failure',
  'elicitation_dialog',
  'elicitation_url_dialog',
  'elicitation_complete',
  'elicitation_response',
  'agent_needs_input',
  'agent_completed',
  'quota_auto_resume_fired',
  'quota_auto_resume_stale',
  'quota_auto_resume_disabled',
  'plugin_notification',
] as const;
/**
 * The documented `StopFailure` error types. The SDK also has `verification_required`, which the
 * docs do not list, so this list is checked to be a subset of the SDK's union, not equal to it.
 */
const STOP_FAILURE_ERRORS = [
  'rate_limit',
  'overloaded',
  'authentication_failed',
  'oauth_org_not_allowed',
  'account_on_hold',
  'billing_error',
  'invalid_request',
  'model_not_found',
  'server_error',
  'max_output_tokens',
  'cloud_credential_error',
  'unknown',
] as const;

/** @public Drift guard. */
export type SessionStartSourcesMatchSdk = Assert<
  Equal<(typeof SESSION_START_SOURCES)[number], HookInputOf<'SessionStart'>['source']>
>;
/** @public Drift guard. */
export type SetupTriggersMatchSdk = Assert<
  Equal<(typeof SETUP_TRIGGERS)[number], HookInputOf<'Setup'>['trigger']>
>;
/** @public Drift guard. */
export type SessionEndReasonsMatchSdk = Assert<
  Equal<(typeof SESSION_END_REASONS)[number], HookInputOf<'SessionEnd'>['reason']>
>;
/** @public Drift guard. */
export type PreCompactTriggersMatchSdk = Assert<
  Equal<(typeof COMPACT_TRIGGERS)[number], HookInputOf<'PreCompact'>['trigger']>
>;
/** @public Drift guard. */
export type PostCompactTriggersMatchSdk = Assert<
  Equal<(typeof COMPACT_TRIGGERS)[number], HookInputOf<'PostCompact'>['trigger']>
>;
/** @public Drift guard. */
export type ConfigChangeSourcesMatchSdk = Assert<
  Equal<(typeof CONFIG_CHANGE_SOURCES)[number], HookInputOf<'ConfigChange'>['source']>
>;
/** @public Drift guard. */
export type DirectoryAddedSourcesMatchSdk = Assert<
  Equal<(typeof DIRECTORY_ADDED_SOURCES)[number], HookInputOf<'DirectoryAdded'>['source']>
>;
/** @public Drift guard. */
export type InstructionsLoadReasonsMatchSdk = Assert<
  Equal<
    (typeof INSTRUCTIONS_LOAD_REASONS)[number],
    HookInputOf<'InstructionsLoaded'>['load_reason']
  >
>;
/** @public Drift guard: every documented error is one the SDK types. */
export type StopFailureErrorsInSdk = Assert<
  (typeof STOP_FAILURE_ERRORS)[number] extends HookInputOf<'StopFailure'>['error'] ? true : false
>;

/** The documented matcher values of the events that have a fixed set of them. */
export const MATCHER_VALUES = {
  SessionStart: SESSION_START_SOURCES,
  Setup: SETUP_TRIGGERS,
  SessionEnd: SESSION_END_REASONS,
  Notification: NOTIFICATION_TYPES,
  PreCompact: COMPACT_TRIGGERS,
  PostCompact: COMPACT_TRIGGERS,
  ConfigChange: CONFIG_CHANGE_SOURCES,
  DirectoryAdded: DIRECTORY_ADDED_SOURCES,
  InstructionsLoaded: INSTRUCTIONS_LOAD_REASONS,
  StopFailure: STOP_FAILURE_ERRORS,
} as const satisfies Partial<Record<HookEvent, readonly string[]>>;
