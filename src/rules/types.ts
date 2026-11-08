import type { PermissionBehavior } from '../protocol/official.ts';
import type { PermissionRuleValue } from '../protocol/official-tools.ts';

/**
 * The contracts every part of the rules module shares (docs/ARCHITECTURE.md, "Layers"). A rule is
 * the official `PermissionRuleValue` (`{ toolName, ruleContent? }`) plus what the kit reads out of
 * it once, so matching never re-parses text.
 */

/**
 * Where a rule was written (permissions.md, "Settings precedence"). It matters only to the path
 * rules, where `/path` anchors differently per source; that table is a registry typed over the
 * `kind`s, never a comparison.
 */
export type RuleSource =
  | { readonly kind: 'project' }
  | { readonly kind: 'local' }
  | { readonly kind: 'user' }
  | { readonly kind: 'flag-settings'; readonly file: string }
  | { readonly kind: 'cli' }
  | { readonly kind: 'session' };

/** What follows the tool name inside the parentheses, once read. */
export type Specifier =
  /** `Agent(model:opus)`: one top-level input parameter (permissions.md, "Match by input parameter"). */
  | { readonly form: 'param'; readonly name: string; readonly value: string }
  /** `WebFetch(domain:*.example.com)`: the `domain:` prefix is part of the form, not the pattern. */
  | { readonly form: 'domain'; readonly pattern: string }
  /** A command, path, agent or skill pattern, as the tool's own format reads it. */
  | { readonly form: 'text'; readonly pattern: string };

/** One permission rule, parsed. */
export interface PermissionRule {
  /** The official shape: the tool-name position and the text between the parentheses. */
  readonly value: PermissionRuleValue;
  readonly behavior: PermissionBehavior;
  readonly source: RuleSource;
  /** The tool-name position holds a glob (`mcp__*`, `*`): permissions.md, "Tool name wildcards". */
  readonly toolGlob: boolean;
  /** `undefined` is a bare tool name: it covers every use of the tool (`Bash(*)` reads as bare). */
  readonly specifier: Specifier | undefined;
}

/** A tool call as a rule sees it: the canonical tool name and the input Claude sent. */
export interface ToolCall {
  readonly toolName: string;
  readonly input: unknown;
}

/**
 * A call after the host's own preparation: the real paths a symlink in the call resolves to, which
 * the path rules need (permissions.md, "Symlinks"). Absent when nothing was resolved.
 */
export interface PreparedCall extends ToolCall {
  readonly resolvedPaths?: readonly string[];
}

/** The folders and platform path rules are read against. Plain data the host supplies. */
export interface PathContext {
  readonly cwd: string;
  readonly home: string;
  readonly primaryWorkingDirectory: string;
  readonly additionalDirectories: readonly string[];
  readonly platform: 'posix' | 'windows';
}

/** Everything a rule needs beside the call itself. */
export interface MatchContext {
  readonly paths: PathContext;
  /** Environment variables an allow rule may see through when it strips `VAR=value` prefixes. */
  readonly safeEnvVars?: ReadonlySet<string>;
}

/** What the rules alone say about a call: the first behaviour that matched, with the rule. */
export interface RuleVerdict {
  readonly behavior: PermissionBehavior | undefined;
  readonly rule?: PermissionRule;
}

/** Why `decide` answered as it did. */
export type DecisionReason =
  | 'deny-rule'
  | 'ask-rule'
  | 'allow-rule'
  | 'read-in-working-directory'
  | 'read-only-command'
  | 'accept-edits'
  | 'protected-path'
  | 'network-path'
  | 'requires-user-interaction'
  | 'mode-bypass'
  | 'mode-dontask'
  | 'mode-plan'
  | 'mode-auto'
  | 'hook'
  | 'mod'
  | 'default-prompt'
  | 'tool-removed';

/**
 * The outcome of a permission check. `classify` means the host's reviewer decides (auto mode): the
 * kit holds no classifier (permissions.md, "Permission modes").
 */
export type Decision =
  | { readonly outcome: 'allow'; readonly reason: DecisionReason }
  | { readonly outcome: 'ask'; readonly reason: DecisionReason }
  | { readonly outcome: 'deny'; readonly reason: DecisionReason }
  | { readonly outcome: 'classify'; readonly reason: DecisionReason };
