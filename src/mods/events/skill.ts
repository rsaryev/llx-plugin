import { z } from 'zod';
import { answer, fields, sameData, text, type EventSpec } from './spec.ts';
import { isRecord } from '../../protocol/is-record.ts';

/**
 * `skill.prompt` (reference.md, "Prompts and what Claude reads" and "Source and frontmatter fields
 * on `skill.prompt`"). A hook can pass a changed `text` or `frontmatter` to `next`; one that changes
 * any other field fails.
 */
const CHANGEABLE: ReadonlySet<string> = new Set(['text', 'frontmatter']);

/** The first field other than `text` and `frontmatter` that differs between the event and the one passed on. */
function changeProblem(original: unknown, changed: unknown): string | undefined {
  if (!isRecord(original) || !isRecord(changed)) return undefined;
  const names = new Set([...Object.keys(original), ...Object.keys(changed)]);
  const field = [...names].find(
    (name) => !CHANGEABLE.has(name) && !sameData(original[name], changed[name]),
  );
  return field === undefined
    ? undefined
    : `skill.prompt: a hook may change text and frontmatter only, not "${field}"`;
}

export const SKILL_PROMPT_SPEC: EventSpec = {
  input: fields({
    skill: text,
    text,
    source: text.optional(),
    pluginName: text.optional(),
    path: text.optional(),
    frontmatter: z.record(z.string(), z.unknown()).optional(),
    frontmatterProblem: text.optional(),
  }),
  result: answer({ text }),
  changeProblem,
};
