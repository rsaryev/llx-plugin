/**
 * The ports (layer 1): the interfaces a host implements so the kit never touches a disk, a
 * process, the network or a clock (docs/API.md, "Ports"). Type-only: nothing here runs.
 * A stream that needs more of a port extends it in its own file; it never edits a shared one
 * without the owner.
 */
export type { Clock } from './clock.ts';
export type {
  CommandResult,
  CommandRun,
  CommandRunner,
  CommandSpec,
  ShellKind,
} from './command-runner.ts';
export type { Environment } from './environment.ts';
export type { FolderScan, RepositoryChain, ScanFolder } from './folder-scan.ts';
export type { PortFailure } from './failure.ts';
export type { DirectoryEntry, FileStat, PluginFiles, TextFileReader } from './files.ts';
export type { HttpClient, HttpFailure, HttpRequest, HttpResponse } from './http-client.ts';
export type { Locations } from './locations.ts';
export type {
  McpAvailability,
  McpCaller,
  McpContentBlock,
  McpToolCall,
  McpToolResult,
} from './mcp-caller.ts';
export type { AgentRequest, ModelAnswer, ModelRequest, ModelRunner } from './model-runner.ts';
export type { ScratchFiles } from './scratch-files.ts';
