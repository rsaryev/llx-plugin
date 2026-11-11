import type { FileEditOutput } from '../../../protocol/official-tools.ts';

/** One hunk of an `Edit` or `Write` result's `structuredPatch` (the SDK's `FileEditOutput`). */
export type PatchHunk = FileEditOutput['structuredPatch'][number];

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/** A header's count is one when it is left out (`@@ -3 +3 @@`), as unified diffs write it. */
const countOf = (text: string | undefined): number => (text === undefined ? 1 : Number(text));

/** What a hunk line uses up of the old and the new side: a marker line uses neither. */
const USES = {
  ' ': { old: 1, new: 1 },
  '-': { old: 1, new: 0 },
  '+': { old: 0, new: 1 },
  '\\': { old: 0, new: 0 },
} as const satisfies Readonly<Record<string, { old: number; new: number }>>;

const usesOf = (mark: string): { old: number; new: number } =>
  mark === '' ? USES[' '] : (Reflect.get(USES, mark) ?? USES[' ']);

/** The `\ No newline at end of file` lines from `from` on, added to `body`; where they end. */
function takeMarkers(lines: readonly string[], from: number, body: string[]): number {
  let at = from;
  for (; lines[at]?.startsWith('\\') === true; at += 1) body.push(lines[at] ?? '');
  return at;
}

/**
 * A hunk's lines as the SDK keeps them: each starts with a space, `+` or `-`; a `\ No newline at
 * end of file` marker stays with the line it follows. The hunk ends where the header's counts say.
 */
function takeHunk(lines: readonly string[], from: number, header: RegExpExecArray) {
  const [, oldStart = '0', oldCount, newStart = '0', newCount] = header;
  let oldLeft = countOf(oldCount);
  let newLeft = countOf(newCount);
  const body: string[] = [];
  let at = from;
  for (; at < lines.length && (oldLeft > 0 || newLeft > 0); at += 1) {
    const line = lines[at] ?? '';
    const used = usesOf(line.charAt(0));
    oldLeft -= used.old;
    newLeft -= used.new;
    body.push(line === '' ? ' ' : line);
  }
  // A marker right after the last counted line belongs to it.
  at = takeMarkers(lines, at, body);
  const hunk: PatchHunk = {
    oldStart: Number(oldStart),
    oldLines: countOf(oldCount),
    newStart: Number(newStart),
    newLines: countOf(newCount),
    lines: body,
  };
  return { hunk, next: at };
}

/**
 * The hunks of a unified diff as the `structuredPatch` of an `Edit` or `Write` result
 * (agent-sdk/typescript.md, "Edit" and "Write" output: "Diff hunks"; empty when nothing changed).
 * The file headers (`---`, `+++`, `Index:`) are skipped, and so is any text that is no hunk.
 * Judgment: the docs name the field and its type and not how a host derives it from its own diff
 * (spec/judgments.md).
 */
export function structuredPatchOf(diff: string): readonly PatchHunk[] {
  const lines = diff.split('\n');
  const hunks: PatchHunk[] = [];
  for (let at = 0; at < lines.length;) {
    const header = HUNK_HEADER.exec(lines[at] ?? '');
    if (header === null) {
      at += 1;
      continue;
    }
    const { hunk, next } = takeHunk(lines, at + 1, header);
    hunks.push(hunk);
    at = next;
  }
  return hunks;
}
