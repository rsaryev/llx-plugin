/** `CLAUDE_ENV_FILE` (hooks.md, "Persist environment variables"): which hooks get it, where it points, how a shell reads it. */
export {
  createEnvFiles,
  type EnvFiles,
  type EnvFilesOptions,
  type HookEnvFiles,
  type PowershellOptions,
} from './files.ts';
export { ENV_FILE_KINDS, type EnvFileKind, type EnvFileStore } from './ports.ts';
export { envFileClearedBy, envFileKindOf, shellHasEnvFile } from './events.ts';
export {
  NOT_PLAIN_ASSIGNMENTS,
  readPowershellVariables,
  type PowershellReadOptions,
  type PowershellVariables,
} from './powershell-reader.ts';
