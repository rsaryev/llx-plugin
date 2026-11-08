/** Literal requirement IDs used by spec calls, respecting the string's own quote delimiter. */
export function testIds(text: string): string[] {
  const calls = /\bspec\(\s*(\[[^\]]*\]|'[^']*'|"[^"]*"|`[^`]*`)/g;
  const literals = /'([^']*)'|"([^"]*)"|`([^`]*)`/g;
  return [...text.matchAll(calls)].flatMap((call) =>
    [...(call[1] ?? '').matchAll(literals)]
      .filter((literal) => literal[3] === undefined || !literal[3].includes('${'))
      .map((literal) => literal[1] ?? literal[2] ?? literal[3] ?? ''),
  );
}
