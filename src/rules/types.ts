import type { PermissionBehavior } from '../protocol/official.ts';
import type { PermissionRuleValue } from '../protocol/official-tools.ts';

/**
 * The contracts every part of the rules module shares (docs/ARCHITECTURE.md, "Layers"). A rule is
 * the official `PermissionRuleValue` (`{ toolName, ruleContent? }`) plus what the kit reads out of
 * it once, so matching never re-parses text.
 */

/**
 * Where a rule was written (permissions.md, "Settings precedence" and "Managed settings"). It
 * matters to the parser (a settings file skips an `mcp__` rule with parentheses, the command line
 * does not) and to the path rules, where `/path` anchors differently per source; each such table is
 * a registry typed over the `kind`s (`sources.ts`), never a comparison. `managed` is the managed
 * tier (server-managed settings, MDM, `managed-settings.json`), the highest: no other source can
 * override its rules. `embedder-managed` is the policy an embedding host passes through the SDK
 * `managedSettings` option.
 */
export type RuleSource =
  | { readonly kind: 'managed' }
  | { readonly kind: 'embedder-managed' }
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
  /** The rule as it was written, trimmed: what a warning repeats ("as you wrote it", errors.md). */
  readonly text: string;
}

/** A tool call as a rule sees it: the canonical tool name and the input Claude sent. */
export interface ToolCall {
  readonly toolName: string;
  readonly input: unknown;
}

/**
 * A call after the host's own preparation: the real paths a symlink in the call resolves to, which
 * the path rules need (permissions.md, "Symlinks"), and the names of a called skill. Absent when
 * nothing was resolved.
 */
export interface PreparedCall extends ToolCall {
  readonly resolvedPaths?: readonly string[];
  /**
   * Every name the called skill goes by (its alias, its display name, a qualified form), which a
   * `Skill(skill:<name>)` deny rule matches (permissions.md, "Match by input parameter"). The host
   * knows its skills; the kit holds no skill catalog.
   */
  readonly skillNames?: readonly string[];
}

/** The folders and platform path rules are read against. Plain data the host supplies. */
export interface PathContext {
  readonly cwd: string;
  readonly home: string;
  readonly primaryWorkingDirectory: string;
  readonly additionalDirectories: readonly string[];
  readonly platform: 'posix' | 'windows';
  /**
   * Directories as a `//`, `~/` or `/` deny or ask rule spells them, mapped to where they really are
   * (`/etc` to `/private/etc`), built with `resolveRuleDirectories`: "a deny or ask rule written
   * through a symlinked directory ... also applies at the directory's real location" (permissions.md,
   * "How rules match a symlinked path"). Absent when no rule goes through a link.
   */
  readonly realDirectories?: ReadonlyMap<string, string>;
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
  | 'tool-removed'
  | 'no-permission-required'
  | 'critical-path'
  | 'outside-working-directory'
  | 'settings-file';

/**
 * The outcome of a permission check. `classify` means the host's reviewer decides (auto mode): the
 * kit holds no classifier (permissions.md, "Permission modes").
 */
export type Decision =
  | { readonly outcome: 'allow'; readonly reason: DecisionReason }
  | { readonly outcome: 'ask'; readonly reason: DecisionReason }
  | { readonly outcome: 'deny'; readonly reason: DecisionReason }
  | { readonly outcome: 'classify'; readonly reason: DecisionReason };
