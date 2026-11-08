/**
 * The architecture gate (docs/ARCHITECTURE.md, "Layers"):
 *
 * - L1 a module of `src/` imports only from its own folder and from lower layers.
 * - L2 `@anthropic-ai/*` is imported only in `src/protocol/`, and only as `import type`: the SDK's
 *   runtime starts the Claude Code program and must never load.
 * - L3 `src/` imports no `node:*`, `bun:*` or `bun` module and reads no ambient effect: `Bun`,
 *   `process`, `globalThis`, `Date`, `performance`, `crypto`, `fetch` and the timers. The kit knows
 *   nothing of the machine it runs on; every effect goes through a port (`Clock`, `HttpClient`…).
 * - L4 `src/` never imports `tests/` or `scripts/`.
 */
import { join } from 'node:path';
import { ROOT } from './docs/location.ts';
import { finish, repositoryFiles } from './lib/files.ts';

/** Lower number, lower layer. `index.ts` at the root of `src/` is the top. */
const LAYERS: Readonly<Record<string, number>> = {
  protocol: 0,
  ports: 1,
  format: 2,
  rules: 3,
  settings: 3,
  marketplace: 3,
  loading: 3,
  foundation: 3,
  agents: 4,
  hooks: 4,
  skills: 4,
  mods: 4,
  host: 5,
  testing: 6,
};
const TOP = 99;

const IMPORT = /(?:^|\n)\s*(import|export)\s+(type\s+)?[^'"]*?from\s+['"]([^'"]+)['"]/g;
const SIDE_EFFECT = /(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g;
/** Ambient effects: a global that reads the machine, the clock, the network or the timers. */
const GLOBALS: readonly { readonly name: string; readonly pattern: RegExp }[] = [
  { name: 'Bun', pattern: /\bBun\s*[.[]/ },
  { name: 'process', pattern: /\bprocess\s*[.[]/ },
  { name: 'globalThis', pattern: /\bglobalThis\b/ },
  { name: 'Date', pattern: /\bDate\s*[.(]|\bnew\s+Date\b/ },
  { name: 'performance', pattern: /\bperformance\s*[.[]/ },
  { name: 'crypto', pattern: /\bcrypto\s*[.[]/ },
  { name: 'fetch', pattern: /\bfetch\s*\(/ },
  {
    name: 'a timer',
    pattern: /\b(?:setTimeout|setInterval|setImmediate|clearTimeout|clearInterval)\s*\(/,
  },
];

const moduleOf = (path: string): string => path.split('/')[1] ?? '';
const layerOf = (path: string): number =>
  path.split('/').length === 2 ? TOP : (LAYERS[moduleOf(path)] ?? -1);

function resolve(from: string, specifier: string): string {
  const parts = from.split('/').slice(0, -1);
  for (const part of specifier.split('/')) {
    if (part === '..') parts.pop();
    else if (part !== '.') parts.push(part);
  }
  return parts.join('/');
}

function importProblems(path: string, text: string): string[] {
  const problems: string[] = [];
  const own = moduleOf(path);
  const imports = [...text.matchAll(IMPORT)].map((m) => ({ type: !!m[2], spec: m[3] ?? '' }));
  imports.push(...[...text.matchAll(SIDE_EFFECT)].map((m) => ({ type: false, spec: m[1] ?? '' })));
  for (const { type, spec } of imports) {
    if (/^(node:|bun:|bun$)/.test(spec)) problems.push(`L3 ${path}: imports ${spec}`);
    if (spec.startsWith('@anthropic-ai/') && (own !== 'protocol' || !type)) {
      problems.push(`L2 ${path}: ${spec} only as \`import type\` in src/protocol`);
    }
    if (!spec.startsWith('.')) continue;
    const target = resolve(path, spec);
    if (!target.startsWith('src/')) problems.push(`L4 ${path}: imports ${spec}`);
    else if (moduleOf(target) !== own && layerOf(target) >= layerOf(path)) {
      problems.push(`L1 ${path}: ${own} may not import ${moduleOf(target)} (same or higher layer)`);
    }
  }
  return problems;
}

const sources = repositoryFiles().filter((path) => path.startsWith('src/') && path.endsWith('.ts'));
const problems: string[] = [];
for (const path of sources) {
  const file = Bun.file(join(ROOT, path));
  if (!(await file.exists())) continue;
  const text = await file.text();
  if (path.split('/').length > 2 && layerOf(path) < 0) {
    problems.push(`L1 ${path}: module "${moduleOf(path)}" has no layer in scripts/check-layers.ts`);
  }
  const code = text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  for (const { name, pattern } of GLOBALS) {
    if (pattern.test(code))
      problems.push(`L3 ${path}: uses ${name}, an effect only a port may have`);
  }
  problems.push(...importProblems(path, text));
}
finish('Layers L1–L4', problems, `${sources.length} source files`);
