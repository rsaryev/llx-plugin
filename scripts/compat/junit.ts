/**
 * Reads a `bun test --reporter=junit` report: every suite named after requirements (`⟦id⟧ ⟦id2⟧`,
 * made by `spec()` in tests/support/spec.ts) with how many tests it ran and how many failed.
 */

export interface Proof {
  readonly tests: number;
  readonly failures: number;
}

const SUITE = /<testsuite\s+name="([^"]*)"[^>]*?\btests="(\d+)"[^>]*?\bfailures="(\d+)"/g;
const ID = /⟦([^⟧]+)⟧/g;

const unescape = (text: string): string =>
  text
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

/** Tests run and failed per requirement id, summed over every block that names it. */
export function proofsOf(xml: string): Map<string, Proof> {
  const proofs = new Map<string, Proof>();
  for (const suite of xml.matchAll(SUITE)) {
    const name = unescape(suite[1] ?? '');
    const tests = Number(suite[2]);
    const failures = Number(suite[3]);
    for (const id of name.matchAll(ID)) {
      const key = id[1] ?? '';
      const known = proofs.get(key) ?? { tests: 0, failures: 0 };
      proofs.set(key, { tests: known.tests + tests, failures: known.failures + failures });
    }
  }
  return proofs;
}
