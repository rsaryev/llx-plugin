/**
 * Ties tests to the requirements they prove (docs/SPEC.md). `spec(id, body)` is a `describe`
 * named `⟦id⟧` (ids hold spaces and brackets, these marks never occur in one): the compatibility report counts a requirement as proven when at least one test
 * under such a block runs and every one of them passes. An id that is not in
 * `spec/requirements.json` fails at once, so no test can claim a requirement the docs do not have.
 */
import { describe } from 'bun:test';
import file from '../../spec/requirements.json' with { type: 'json' };

const known = new Set(file.requirements.map((requirement) => requirement.id));

export function spec(ids: string | readonly string[], body: () => void): void {
  const list = typeof ids === 'string' ? [ids] : ids;
  const unknown = list.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw new Error(`Not in spec/requirements.json: ${unknown.join(', ')}`);
  }
  describe(list.map((id) => `⟦${id}⟧`).join(' '), body);
}
