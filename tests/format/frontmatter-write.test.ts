/**
 * The frontmatter writer is the inverse of `parseFrontmatter` (skills.md, "Frontmatter reference":
 * YAML between `---` markers on line 1; sub-agents.md, "Write subagent files": "YAML frontmatter
 * ... followed by the system prompt in Markdown"). How a file is written the docs do not say: judgment
 * `frontmatterWriter` (spec/judgments.md), so no `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import { parseFrontmatter } from '../../src/format/frontmatter.ts';
import { editFrontmatter, writeFrontmatter } from '../../src/format/frontmatter-write.ts';

/** A seeded generator (mulberry32), so a failing case is the same case on every run. */
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TEXTS = [
  '',
  'plain',
  'true',
  'false',
  'null',
  '~',
  'yes',
  'off',
  '1',
  '-1.5',
  '0x1F',
  '1e3',
  '.inf',
  '2026-11-11',
  ' lead',
  'trail ',
  'Use when: x',
  'key:',
  '#hash',
  'a #b',
  '- item',
  '? q',
  '@file',
  '`code`',
  '*.md',
  '&anchor',
  '!tag',
  '%dir',
  '|',
  '>',
  '{a}',
  '[b]',
  '"quoted"',
  "'single'",
  '---',
  '...',
  'line one\nline two',
  'ends\n',
  '\n\nopens',
  'two  spaces',
  '\ttab',
  'ü é 中',
  'crlf\r\nline',
  'back\\slash',
  'a,b c',
] as const;
const NUMBERS = [0, 1, -7, 3.25, 1e21, 0.1, Number.MAX_SAFE_INTEGER, Infinity, -Infinity] as const;
const KEYS = [
  'name',
  'description',
  'allowed-tools',
  'when_to_use',
  'a b',
  'x:y',
  '-',
  '?',
  '#k',
  'ü',
];

const pick = <T>(next: () => number, from: readonly T[]): T =>
  from[Math.floor(next() * from.length)] ?? from[0] ?? (undefined as never);

function value(next: () => number, depth: number): unknown {
  const kind = Math.floor(next() * (depth > 2 ? 4 : 6));
  const makers: readonly (() => unknown)[] = [
    () => pick(next, TEXTS) + (next() < 0.3 ? pick(next, TEXTS) : ''),
    () => pick(next, NUMBERS),
    () => next() < 0.5,
    () => null,
    () => Array.from({ length: Math.floor(next() * 4) }, () => value(next, depth + 1)),
    () => table(next, depth + 1),
  ];
  return (makers[kind] ?? makers[0] ?? (() => null))();
}

function table(next: () => number, depth: number): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (let i = Math.floor(next() * 4); i > 0; i -= 1) out[pick(next, KEYS)] = value(next, depth);
  return out;
}

const BODIES = [
  '',
  '\n',
  '# Title\n',
  '\n\nText\n',
  '---\nnot a block\n---\n',
  'no newline',
  '\r\nwin\r\n',
];

describe('writeFrontmatter', () => {
  test('what it writes reads back to the same fields and body, for every value shape', () => {
    const next = random(20261111);
    for (let run = 0; run < 2000; run += 1) {
      const fields = table(next, 0);
      const body = pick(next, BODIES) + (next() < 0.5 ? pick(next, TEXTS) : '');
      const read = parseFrontmatter(writeFrontmatter(fields, body));
      expect({ state: read.state, fields: read.fields, body: read.body }).toEqual({
        state: 'ok',
        fields,
        body,
      });
    }
  });

  test('keys keep the order given; undefined is no key; empty fields still write the markers', () => {
    const text = writeFrontmatter({ b: 1, a: undefined, c: 'x' }, 'Body');
    expect(text).toBe('---\nb: 1\nc: x\n---\nBody');
    expect(Object.keys(parseFrontmatter(text).fields)).toEqual(['b', 'c']);
    expect(writeFrontmatter({}, '---\n')).toBe('---\n---\n---\n');
  });

  test('a value that needs quoting is quoted, and a long line is not folded', () => {
    const long = 'word '.repeat(60).trim();
    const text = writeFrontmatter({ description: 'Use when: x', hint: '@file', long }, '');
    expect(text).toContain('description: "Use when: x"\nhint: "@file"\n');
    expect(text).toContain(`long: ${long}\n`);
  });

  test('a value given twice is written twice, not as an alias', () => {
    const shared = ['Read'];
    expect(writeFrontmatter({ a: shared, b: shared }, '')).not.toContain('&');
  });
});

describe('editFrontmatter', () => {
  const file =
    '---\n# who owns it\nname: demo # inline\ndescription: Old\nx-host: kept\n---\n\nBody\n';

  test('a key it has keeps its place, a new one goes last, comments and other keys stay', () => {
    const edit = editFrontmatter(file, { description: 'New: one', model: 'sonnet' });
    expect(edit).toEqual({
      ok: true,
      text: '---\n# who owns it\nname: demo # inline\ndescription: "New: one"\nx-host: kept\nmodel: sonnet\n---\n\nBody\n',
    });
  });

  test('undefined removes a key; the body is kept byte for byte unless one is given', () => {
    const removed = editFrontmatter(file, { description: undefined });
    expect(removed.ok && parseFrontmatter(removed.text).fields).toEqual({
      name: 'demo',
      'x-host': 'kept',
    });
    expect(removed.ok && parseFrontmatter(removed.text).body).toBe('\nBody\n');
    const rebodied = editFrontmatter(file, {}, 'New body');
    expect(rebodied.ok && parseFrontmatter(rebodied.text).body).toBe('New body');
  });

  test('a key the block repeats is set once, in its first place', () => {
    const edit = editFrontmatter('---\na: 1\nb: 2\na: 3\n---\n', { a: 9 });
    expect(edit).toEqual({ ok: true, text: '---\na: 9\nb: 2\n---\n' });
  });

  test('a file with no block gets one, its whole text the body; an empty block is filled', () => {
    expect(editFrontmatter('Just text\n', { name: 'x' })).toEqual({
      ok: true,
      text: '---\nname: x\n---\nJust text\n',
    });
    expect(editFrontmatter('---\n---\nB', { name: 'x' })).toEqual({
      ok: true,
      text: '---\nname: x\n---\nB',
    });
  });

  test('a block the reader repairs is edited as it reads, and comes out valid YAML', () => {
    const edit = editFrontmatter('---\ndescription: Does X: then Y\n---\n', { name: 'n' });
    expect(edit.ok && parseFrontmatter(edit.text).fields).toEqual({
      description: 'Does X: then Y',
      name: 'n',
    });
  });

  test('a block that does not read is refused, never overwritten', () => {
    expect(editFrontmatter('---\n  a: 1\n b: 2\n---\n', { a: 1 })).toMatchObject({
      ok: false,
      state: 'invalid-yaml',
    });
    expect(editFrontmatter('---\n- a\n---\n', { a: 1 })).toMatchObject({
      ok: false,
      state: 'not-a-table',
    });
  });
});
