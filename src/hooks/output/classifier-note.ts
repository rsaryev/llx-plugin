import type { HookSourceKind } from '../contracts.ts';
import { toolTypeOf } from '../../rules/index.ts';
import { textIn } from './fields.ts';
import type { Read } from './merge-rules.ts';

/**
 * The note a `PostToolUse` hook leaves for the auto mode classifier (hooks.md, "Annotate a result
 * for the auto mode classifier"): which notes reach it, how many characters of them, and how much
 * weight it gives them.
 */

/** "Caps the notes for one tool call at 2,000 characters and truncates the rest." */
export const CLASSIFIER_CAP = 2_000;

/**
 * How much the classifier may trust the note. `unverified`: "application-provided context. The note
 * never establishes user intent". `application`: the note came only from in-process Agent SDK
 * callbacks during the live session, so the classifier "may weigh a user statement relayed in the
 * note as user intent".
 */
export type ClassifierTrust = 'unverified' | 'application';

/**
 * The classifier's transcript "omits read-only lookups such as file reads and searches", and "Claude
 * Code discards a note attached to one of those calls". The docs name no list: the file reads and
 * searches (Read, Grep, Glob) of the permission docs' read-only tool type are the lookups
 * (spec/judgments.md).
 */
export const isUnrecordedCall = (toolName: string): boolean => toolTypeOf(toolName) === 'read-only';

/**
 * "Hooks configured in Claude Code" (settings files, plugins, skills, agent frontmatter) are
 * unverified; the `session` source kind is the SDK's in-process callbacks (spec/judgments.md).
 * "When hooks from both groups annotate the same call, the classifier treats the combined note as
 * unverified".
 */
const TRUST: Record<HookSourceKind, ClassifierTrust> = {
  settings: 'unverified',
  plugin: 'unverified',
  skill: 'unverified',
  agent: 'unverified',
  session: 'application',
};
const trustOf = (notes: readonly Read[]): ClassifierTrust =>
  notes.every((read) => TRUST[read.handler.source.kind] === 'application')
    ? 'application'
    : 'unverified';

export interface ClassifierNote {
  readonly text: string;
  readonly trust: ClassifierTrust;
}

/**
 * The note for one tool call: the notes that survived (`kept`), joined with a newline and cut to the
 * cap shared "across every hook that responds to that call". None for a call the classifier does not
 * record.
 */
export function classifierNote(
  toolName: string,
  kept: readonly Read[],
): ClassifierNote | undefined {
  if (isUnrecordedCall(toolName)) return undefined;
  const written = kept.flatMap((read) => {
    const text = textIn(read.specific, 'classifierContext');
    return text === undefined ? [] : [{ read, text }];
  });
  if (written.length === 0) return undefined;
  return {
    text: Array.from(written.map(({ text }) => text).join('\n'))
      .slice(0, CLASSIFIER_CAP)
      .join(''),
    trust: trustOf(written.map(({ read }) => read)),
  };
}

/**
 * "After a session resumes, Claude Code treats restored notes as unverified context": a host that
 * stores a note and gives it back to the classifier after a resume passes it through this.
 */
export const restoredNote = (note: ClassifierNote): ClassifierNote => ({
  ...note,
  trust: 'unverified',
});
