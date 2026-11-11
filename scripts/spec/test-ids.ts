/** Literal requirement IDs used by spec calls, respecting the string's own quote delimiter. */
export function testIds(text: string): string[] {
  const string = String.raw`'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|` + '`(?:[^`\\\\]|\\\\.)*`';
  const calls = new RegExp(
    String.raw`\bspec\(\s*(\[(?:\s*(?:${string})\s*,?)*\s*\]|${string})`,
    'g',
  );
  const literals = new RegExp(string, 'g');
  return [...text.matchAll(calls)].flatMap((call) =>
    [...(call[1] ?? '').matchAll(literals)]
      .map((literal) => literal[0])
      .filter((literal) => !literal.startsWith('`') || !literal.includes('${'))
      .map((literal) => literal.slice(1, -1).replaceAll(/\\(['"\\])/g, '$1')),
  );
}
