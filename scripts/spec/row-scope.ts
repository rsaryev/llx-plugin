/** Explicit exclusions inside the mixed native env/CLI tables; independent of proof coverage. */
import type { Reason } from './scope.ts';

export const FOREIGN_ENVIRONMENT: Readonly<Record<string, Reason>> = {
  CLAUDE_AGENT_SDK_MCP_NO_PREFIX: 'runtime',
  CLAUDE_CODE_BRIDGE_SESSION_ID: 'runtime',
  CLAUDE_CODE_REMOTE_SESSION_ID: 'runtime',
  CLAUDE_CODE_PROJECT_DIR_NAME: 'runtime',
  CLAUDE_CODE_DISABLE_BUNDLED_SKILLS: 'builtin',
  CLAUDE_CODE_FORK_SUBAGENT: 'runtime',
  CLAUDE_CODE_FORWARD_SUBAGENT_TEXT: 'runtime',
  CLAUDE_CODE_MAX_SUBAGENTS_PER_SESSION: 'runtime',
  CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL: 'model',
  CLAUDE_SUBAGENT_BG_SHELL_MAX_MS: 'runtime',
  CLAUDE_CODE_PACKAGE_MANAGER_AUTO_UPDATE: 'runtime',
  CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST: 'runtime',
  CLAUDE_CODE_SYNC_SKILLS: 'service',
  CLAUDE_CODE_SYNC_SKILLS_INSTALL_TIMEOUT_MS: 'service',
  CLAUDE_CODE_SYNC_SKILLS_WAIT_TIMEOUT_MS: 'service',
  OTEL_LOG_MANAGED_SETTINGS: 'telemetry',
  OTEL_METRICS_INCLUDE_SESSION_ID: 'telemetry',
};

export const FOREIGN_FLAGS = new Set([
  '--append-subagent-system-prompt',
  '--append-subagent-system-prompt-file',
  '--forward-subagent-text',
]);

export const PLUGIN_GLOBAL_ENV = new Set([
  'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC',
  'DISABLE_TELEMETRY',
  'DO_NOT_TRACK',
]);
