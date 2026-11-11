import type { PluginIssue } from '../../format/issues.ts';
import type { BodyReader, InvocableHead } from '../../format/skill-types.ts';
import type { ScopePlace } from '../../foundation/scope-folders.ts';
import type { ScanFolder } from '../../ports/folder-scan.ts';
import type { ScanContext, ScanScope, ScopeRule } from './locations.ts';

/**
 * What a scan of the scope folders returns. An entry holds the skill or command without its body
 * (`InvocableHead`) and the `BodyReader` that gets the body when the skill runs: a catalog of
 * hundreds of skills keeps their names, descriptions and settings, not megabytes of Markdown
 * (spec/judgments.md, "metadata-first catalog").
 */

export interface ScannedEntry {
  readonly invocable: InvocableHead;
  /** Reads the body now, through the same `FolderScan` port; see `BodyReader` for the contract. */
  readonly readBody: BodyReader;
  readonly scope: ScanScope;
  /** The skill folder's name, or the command's name: the other name a skill is typed by. */
  readonly dirName: string;
  /** The base directory the entry was read below. */
  readonly base: string;
  /** Where the folder (or file) really lives; two entries with one target are one skill. */
  readonly canonical?: string;
}

/** A skill folder that is also a plugin, `<name>@skills-dir` (skills.md, "Skill folder as a plugin"). */
export interface SkillsDirectoryPlugin {
  readonly id: string;
  /** The plugin's name: its manifest's, else its folder's. */
  readonly name: string;
  /** The folder's host path; `FolderScan.open` gives the files to load it with. */
  readonly dir: string;
  readonly scope: ScanScope;
  /** A project's plugin loads only after the workspace trust dialog is accepted. */
  readonly requiresTrust: boolean;
}

export interface ScanOutcome {
  readonly entries: readonly ScannedEntry[];
  readonly plugins: readonly SkillsDirectoryPlugin[];
  readonly issues: readonly PluginIssue[];
  /** The skills folders the session watches for changes (those that exist). */
  readonly watch: readonly string[];
}

export const EMPTY: ScanOutcome = { entries: [], plugins: [], issues: [], watch: [] };

export const merge = (parts: readonly ScanOutcome[]): ScanOutcome => ({
  entries: parts.flatMap((part) => part.entries),
  plugins: parts.flatMap((part) => part.plugins),
  issues: parts.flatMap((part) => part.issues),
  watch: parts.flatMap((part) => part.watch),
});

/** One base directory of one scope, opened. */
export interface Where {
  readonly context: ScanContext;
  readonly rule: ScopeRule;
  readonly scope: ScanScope;
  readonly folder: ScanFolder;
  /** Where the base sits in the scope and which scope folder below it is read. */
  readonly place: ScopePlace;
}
