import { z } from 'zod';
import type { EventFactsOf } from '../contracts.ts';
import { optional } from './facts-shared.ts';

/**
 * Facts of the remaining events (hooks.md, "Notification input", "Elicitation", "ConfigChange
 * input", "CwdChanged input", "WorktreeCreate input", "InstructionsLoaded input", "FileChanged
 * input", "DirectoryAdded input").
 */

const elicitationMode = z.enum(['form', 'url']);

export const NotificationFacts = z.object({
  message: z.string(),
  title: optional(z.string()),
  notification_type: z.string(),
}) satisfies z.ZodType<EventFactsOf<'Notification'>>;

export const ElicitationFacts = z.object({
  mcp_server_name: z.string(),
  message: z.string(),
  mode: optional(elicitationMode),
  url: optional(z.string()),
  elicitation_id: optional(z.string()),
  requested_schema: optional(z.record(z.string(), z.unknown())),
}) satisfies z.ZodType<EventFactsOf<'Elicitation'>>;

export const ElicitationResultFacts = z.object({
  mcp_server_name: z.string(),
  elicitation_id: optional(z.string()),
  mode: optional(elicitationMode),
  action: z.enum(['accept', 'decline', 'cancel']),
  content: optional(z.record(z.string(), z.unknown())),
}) satisfies z.ZodType<EventFactsOf<'ElicitationResult'>>;

export const ConfigChangeFacts = z.object({
  source: z.enum([
    'user_settings',
    'project_settings',
    'local_settings',
    'policy_settings',
    'skills',
  ]),
  file_path: optional(z.string()),
}) satisfies z.ZodType<EventFactsOf<'ConfigChange'>>;

export const CwdChangedFacts = z.object({
  old_cwd: z.string(),
  new_cwd: z.string(),
}) satisfies z.ZodType<EventFactsOf<'CwdChanged'>>;

export const WorktreeCreateFacts = z.object({
  name: z.string(),
}) satisfies z.ZodType<EventFactsOf<'WorktreeCreate'>>;

export const WorktreeRemoveFacts = z.object({
  worktree_path: z.string(),
}) satisfies z.ZodType<EventFactsOf<'WorktreeRemove'>>;

export const InstructionsLoadedFacts = z.object({
  file_path: z.string(),
  memory_type: z.enum(['User', 'Project', 'Local', 'Managed']),
  load_reason: z.enum([
    'session_start',
    'nested_traversal',
    'path_glob_match',
    'include',
    'compact',
  ]),
  globs: optional(z.array(z.string())),
  trigger_file_path: optional(z.string()),
  parent_file_path: optional(z.string()),
}) satisfies z.ZodType<EventFactsOf<'InstructionsLoaded'>>;

export const FileChangedFacts = z.object({
  file_path: z.string(),
  event: z.enum(['change', 'add', 'unlink']),
}) satisfies z.ZodType<EventFactsOf<'FileChanged'>>;

export const DirectoryAddedFacts = z.object({
  directory: z.string(),
  source: z.enum(['slash_command', 'register_repo_root']),
}) satisfies z.ZodType<EventFactsOf<'DirectoryAdded'>>;
