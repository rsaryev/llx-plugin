import { AGENT_FIELD_NAMES, type AgentFieldName } from './agent-fields.ts';
import type { UnrecognizedField } from './agent-record.ts';

/** sub-agents.md: "The debug log names up to five top-level fields". */
const MAX_REPORTED = 5;

/** A name this far from a supported one (in edits) still reads as a misspelling of it. */
const CLOSE = 2;

/** The number of single-character edits between two words (Levenshtein). */
function distance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let row = 1; row <= a.length; row++) {
    const current = [row];
    for (let column = 1; column <= b.length; column++) {
      const cost = a[row - 1] === b[column - 1] ? 0 : 1;
      current.push(
        Math.min(
          (previous[column] ?? 0) + 1,
          (current[column - 1] ?? 0) + 1,
          (previous[column - 1] ?? 0) + cost,
        ),
      );
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
}

/**
 * The supported field a misspelling most likely means: the same letters in another case
 * (`maxturns`) or within two edits (`maxTurn`, `disalowedTools`), the nearest first. Judgment: the
 * docs say only "the likely intended name when a supported field is close" (spec/judgments.md).
 */
function closest(field: string): AgentFieldName | undefined {
  const lower = field.toLowerCase();
  const scored = AGENT_FIELD_NAMES.map((name) => ({
    name,
    edits: distance(lower, name.toLowerCase()),
  })).filter(({ edits }) => edits <= CLOSE);
  return scored.toSorted((a, b) => a.edits - b.edits)[0]?.name;
}

const KNOWN: ReadonlySet<string> = new Set(AGENT_FIELD_NAMES);

/**
 * The top-level fields of an agent file that Claude Code does not recognize (sub-agents.md,
 * "Frontmatter reference": it "ignores a field it doesn't recognize without reporting an error";
 * the debug log names up to five, with the likely intended name). In file order.
 */
export function unrecognizedFields(
  fields: Readonly<Record<string, unknown>>,
): readonly UnrecognizedField[] {
  return Object.keys(fields)
    .filter((field) => !KNOWN.has(field))
    .slice(0, MAX_REPORTED)
    .map((field) => {
      const suggestion = closest(field);
      return suggestion === undefined ? { field } : { field, suggestion };
    });
}
