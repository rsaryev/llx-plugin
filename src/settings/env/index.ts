/** The `env` block of settings files: the ignored variables, what the files come to and when it applies. */
export {
  IGNORE_REASONS,
  envIgnored,
  ignoredBecause,
  turnsTelemetryOff,
  type IgnoreReason,
} from './ignored-variables.ts';
export {
  SUBPROCESS_ONLY,
  appliesAtStartup,
  composeEnvironments,
  isUnsetForProvider,
  resolveEnv,
  type EnvInput,
  type EnvResolution,
  type EnvTrust,
  type NotApplied,
  type NotAppliedVariable,
  type Variables,
} from './resolve-env.ts';
export { envAfterCd, envChange, type EnvChange } from './timing.ts';
