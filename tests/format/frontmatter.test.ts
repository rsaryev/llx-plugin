/**
 * skills.md, "Frontmatter reference": the opening `---` must be the first line, otherwise the whole
 * file is content; YAML that does not parse leaves the file loaded with no fields (also
 * output-styles.md). The delimiter details the docs leave open are judgments (spec/judgments.md).
 */
import { describe, expect, test } from 'bun:test';
import { parseFrontmatter } from '../../src/format/frontmatter.ts';

describe('parseFrontmatter', () => {
  test('splits fields from the body', () => {
    const result = parseFrontmatter('---\nname: demo\nuser-invocable: false\n---\n# Title\nText\n');
    expect(result).toEqual({
      state: 'ok',
      present: true,
      fields: { name: 'demo', 'user-invocable': false },
      body: '# Title\nText\n',
    });
  });

  test('the opening marker must be line 1; otherwise everything is body', () => {
    const text = '\n---\nname: demo\n---\nbody';
    expect(parseFrontmatter(text)).toEqual({
      state: 'none',
      present: false,
      fields: {},
      body: text,
    });
    const markdown = 'Intro\n---\nname: demo\n---\n';
    expect(parseFrontmatter(markdown).body).toBe(markdown);
  });

  test('an opening marker without a closing one is body, not frontmatter', () => {
    const text = '---\nname: demo\nno end';
    expect(parseFrontmatter(text)).toEqual({
      state: 'none',
      present: false,
      fields: {},
      body: text,
    });
  });

  test('YAML that does not parse: no fields, the body is kept, a problem is named', () => {
    const result = parseFrontmatter('---\nname: [unclosed\n---\nkept');
    expect(result.state).toBe('invalid-yaml');
    expect(result.present).toBe(true);
    expect(result.fields).toEqual({});
    expect(result.body).toBe('kept');
    expect(result.problem).toBeString();
  });

  test('a YAML problem is located in the file: the opening marker is line 1', () => {
    const lines = ['---', 'a: 1', 'b: c: d', '---', ''];
    for (const text of [lines.join('\n'), lines.join('\r\n'), `\uFEFF${lines.join('\n')}`]) {
      const result = parseFrontmatter(text);
      expect(result.problem).toBe('Nested mappings are not allowed in compact mappings');
      expect([result.line, result.column]).toEqual([3, 4]);
    }
    const duplicate = parseFrontmatter('---\na: 1\na: 2\n---\n');
    expect([duplicate.line, duplicate.column]).toEqual([3, 1]);
  });

  test('a list or scalar block points at the first line of the block; ok and none have no location', () => {
    const list = parseFrontmatter('---\n- a\n---\n');
    expect([list.state, list.line, list.column]).toEqual(['not-a-table', 2, 1]);
    expect(parseFrontmatter('---\na: 1\n---\n').line).toBeUndefined();
    expect(parseFrontmatter('plain').line).toBeUndefined();
  });

  test('a duplicate key does not parse', () => {
    expect(parseFrontmatter('---\na: 1\na: 2\n---\n').state).toBe('invalid-yaml');
  });

  test('a list or a scalar is not a table', () => {
    for (const yaml of ['- a\n- b', 'just text', '42']) {
      const result = parseFrontmatter(`---\n${yaml}\n---\nbody`);
      expect(result.state).toBe('not-a-table');
      expect(result.fields).toEqual({});
      expect(result.problem).toBe('is a list or a single value, not a table');
    }
  });

  test('an empty block is present with no fields', () => {
    expect(parseFrontmatter('---\n---\nbody')).toEqual({
      state: 'ok',
      present: true,
      fields: {},
      body: 'body',
    });
    expect(parseFrontmatter('---\n# only a comment\n---\n').fields).toEqual({});
  });

  test('CRLF files read like LF files', () => {
    const result = parseFrontmatter('---\r\nname: demo\r\n---\r\nbody\r\n');
    expect(result.fields).toEqual({ name: 'demo' });
    expect(result.body).toBe('body\r\n');
  });

  test('a byte order mark before the opening marker is ignored', () => {
    expect(parseFrontmatter('﻿---\nname: demo\n---\nbody').fields).toEqual({ name: 'demo' });
  });

  test('a body that holds more --- lines is left whole', () => {
    expect(parseFrontmatter('---\na: 1\n---\nx\n---\ny\n').body).toBe('x\n---\ny\n');
  });

  test('YAML 1.2 core: yes, no and on stay strings; quoted scalars and block scalars work', () => {
    const { fields } = parseFrontmatter(
      '---\nflag: yes\nother: on\ncount: 3\ntext: "a: b"\nlong: >-\n  one\n  two\nlist: [a, b]\n---\n',
    );
    expect(fields).toEqual({
      flag: 'yes',
      other: 'on',
      count: 3,
      text: 'a: b',
      long: 'one two',
      list: ['a', 'b'],
    });
  });

  test('never throws: an alias bomb is a document that does not parse', () => {
    const levels = Array.from(
      { length: 12 },
      (_, i) => `l${i + 1}: &l${i + 1} [${i === 0 ? '0' : `*l${i}, *l${i}, *l${i}`}]`,
    );
    expect(parseFrontmatter(`---\n${levels.join('\n')}\n---\n`).state).toBe('invalid-yaml');
  });

  test('a key named __proto__ is data, not the prototype', () => {
    const { fields } = parseFrontmatter('---\n__proto__: {polluted: true}\n---\n');
    expect(Object.getPrototypeOf(fields)).toBe(Object.prototype);
    expect('polluted' in {}).toBe(false);
  });

  test('an empty file and a file of markers only do not throw', () => {
    expect(parseFrontmatter('').state).toBe('none');
    expect(parseFrontmatter('---').state).toBe('none');
    expect(parseFrontmatter('---\n---').state).toBe('ok');
  });
});
