import type { HooksSettings } from '../protocol/hook-config.ts';
import type { AgentDefinition } from '../protocol/official.ts';
import type { PluginIssue } from './issues.ts';

/**
 * Where an agent file comes from, in priority order (sub-agents.md, "Choose the subagent scope":
 * managed, `--agents` flag, project, user, plugin; the first that defines a name wins).
 */
export const AGENT_SOURCES = ['managed', 'flag', 'project', 'user', 'plugin'] as const;
export type AgentSource = (typeof AGENT_SOURCES)[number];

/** What a host knows about an agent file besides its text. */
export type AgentOrigin = FileOrigin | PluginOrigin;

interface FileOrigin {
  /** The file as the host names it: used for issues and for the file name fallback. */
  readonly path: string;
  readonly source: Exclude<AgentSource, 'plugin'>;
  readonly plugin?: undefined;
}

interface PluginOrigin {
  readonly path: string;
  readonly source: 'plugin';
  readonly plugin: {
    readonly name: string;
    /**
     * The path below the plugin's `agents/` folder, such as `review/security.md`; undefined for a
     * file the manifest's `agents` field lists, which loads without subfolder names.
     */
    readonly relativePath?: string | undefined;
  };
}

/** Fields the official `AgentDefinition` has no key for (filled field by field, SP-2). */
export interface AgentExtras {
  readonly color?: 'red' | 'blue' | 'green' | 'yellow' | 'purple' | 'orange' | 'pink' | 'cyan';
  readonly isolation?: 'worktree';
  readonly cacheTtl?: '5m' | '1h';
}

export interface UnrecognizedField {
  readonly field: string;
  /** A supported field name that is close to it. */
  readonly suggestion?: string;
}

/** One agent file as Claude Code would load it. */
export interface AgentRecord {
  /** The frontmatter name, or the file name when it is missing or unusable (plugin agents only). */
  readonly name: string;
  /** `my-plugin:review:security` for a plugin agent; the name for every other source. */
  readonly scopedName: string;
  readonly source: AgentSource;
  readonly path: string;
  /** The official shape; `prompt` is the Markdown body. */
  readonly definition: AgentDefinition;
  readonly extras: AgentExtras;
  /** The frontmatter `hooks`, in the settings' shape; never set for a plugin agent. */
  readonly hooks: HooksSettings | undefined;
  /** Fields in the file that Claude Code does not apply for this source. */
  readonly ignored: readonly string[];
  /** Up to five top-level fields Claude Code does not recognize. */
  readonly unrecognized: readonly UnrecognizedField[];
}

export type AgentReadResult =
  | {
      readonly outcome: 'loaded';
      readonly agent: AgentRecord;
      readonly issues: readonly PluginIssue[];
    }
  | {
      readonly outcome: 'skipped';
      /** `documentation`: no name, so Claude Code reads the file as a note beside the agents. */
      readonly reason: 'documentation' | 'invalid';
      readonly agent: undefined;
      readonly issues: readonly PluginIssue[];
    };
