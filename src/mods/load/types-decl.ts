/**
 * The `$.state` values a mod declares (plugins/mods/interface.md, "Declare the values"): the outer
 * key of `PluginState` is the plugin's name and each entry under it is a value and its type.
 *
 * Judgment: the kit reads the declaration file as text and finds the keys by braces, not as
 * TypeScript: the docs show one shape (`declare module 'claude-code' { interface PluginState { 'name': { key: type } } }`)
 * and a type the reader cannot follow only costs the value its check.
 */

/** The text between the braces that open at `from` (the index of `{`), and the index after the closing one. */
function block(
  text: string,
  from: number,
): { readonly inner: string; readonly end: number } | undefined {
  let depth = 0;
  for (let at = from; at < text.length; at += 1) {
    const char = text[at];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) return { inner: text.slice(from + 1, at), end: at + 1 };
  }
  return undefined;
}

const ENTRY = /(?:'([^']+)'|"([^"]+)"|([A-Za-z_$][\w$-]*))\s*\??\s*:\s*\{/g;

/** How much a character changes the depth of nesting in a type: a bracket opens, its pair closes. */
const DEPTH: Readonly<Record<string, number>> = {
  '{': 1,
  '(': 1,
  '[': 1,
  '<': 1,
  '}': -1,
  ')': -1,
  ']': -1,
  '>': -1,
};
const SEPARATORS: ReadonlySet<string> = new Set([';', ',', '\n']);
const MEMBER = /^\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z_$][\w$]*))\s*\??\s*:/;

/** The members of a block, split where a `;`, `,` or newline stands outside every bracket. */
function members(inner: string): string[] {
  const found: string[] = [];
  let depth = 0;
  let current = '';
  let previous = '';
  for (const char of inner) {
    // `=>` of a function type is an arrow, not a closing angle bracket.
    depth += char === '>' && previous === '=' ? 0 : (DEPTH[char] ?? 0);
    previous = char;
    if (depth === 0 && SEPARATORS.has(char)) {
      found.push(current);
      current = '';
    } else current += char;
  }
  return [...found, current];
}

/** The keys written at the top level of a block of members: `tab: 'one' | 'two'`, `count: number`. */
function memberKeys(inner: string): string[] {
  return members(inner)
    .map((member) => MEMBER.exec(member))
    .flatMap((found) => {
      const key = found?.[1] ?? found?.[2] ?? found?.[3];
      return key === undefined ? [] : [key];
    });
}

/** `plugin.key` of every value declared under `PluginState` in a declaration file. */
export function declaredState(declarations: string): ReadonlySet<string> {
  const declared = new Set<string>();
  const start = /interface\s+PluginState\s*\{/.exec(declarations);
  if (!start) return declared;
  const state = block(declarations, start.index + start[0].length - 1);
  if (!state) return declared;
  const entries = new RegExp(ENTRY);
  for (let entry = entries.exec(state.inner); entry; entry = entries.exec(state.inner)) {
    const plugin = entry[1] ?? entry[2] ?? entry[3];
    const values = block(state.inner, entry.index + entry[0].length - 1);
    if (plugin === undefined || !values) continue;
    for (const key of memberKeys(values.inner)) declared.add(`${plugin}.${key}`);
    // The next entry starts after this one's closing brace: a nested block is not a plugin.
    entries.lastIndex = values.end;
  }
  return declared;
}
