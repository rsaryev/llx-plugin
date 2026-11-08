/**
 * tools-reference.md § Edit tool behavior ("The Edit tool performs exact string replacement. It
 * takes an `old_string` and a `new_string` and replaces the first with the second. It doesn't use
 * regex or fuzzy matching."; the checks Match and Uniqueness; "Non-UTF-8 files") and hooks.md §
 * Edit (`old_string` "Text to find and replace", `new_string` "Replacement text", `replace_all`
 * "Whether to replace all occurrences"); errors.md § File is not valid UTF-8 (the message,
 * verbatim). The kit applies an edit to text it is given: reading, writing and the read-before-edit
 * rule are the host's. What the docs leave open (an empty `old_string`, overlapping occurrences,
 * the wording of the refusals) is a judgment, tested outside spec().
 */
import { describe, expect, test } from 'bun:test';
import {
  applyEdit,
  editEncodingIssue,
  NOT_UTF8_MESSAGE,
  writeEncodingIssue,
} from '../../src/rules/index.ts';
import { spec } from '../support/spec.ts';

const edit = (content: string, old_string: string, new_string: string, replace_all?: boolean) =>
  applyEdit(content, { old_string, new_string, replace_all });

spec('tools.input.Edit.old_string', () => {
  test('the text to find is replaced by the replacement, the rest of the file is untouched', () => {
    const done = edit('const a = 1;\nconst b = 2;\n', 'const b = 2;', 'const b = 3;');
    expect(done.issues).toEqual([]);
    expect(done.content).toBe('const a = 1;\nconst b = 3;\n');
    expect(done.replacements).toBe(1);
  });

  test('"It doesn\'t use regex": metacharacters match themselves', () => {
    expect(edit('a.c abc', 'a.c', 'X').content).toBe('X abc');
    expect(edit('x+ xx', 'x+', 'Y').content).toBe('Y xx');
    expect(edit('abc', 'a.c', 'X').issues).toHaveLength(1);
  });

  test('"A single character of whitespace or indentation difference is enough to miss"', () => {
    const file = 'if (x) {\n  run();\n}\n';
    const miss = edit(file, 'if (x) {\n run();\n}', 'nothing');
    expect(miss.issues).toHaveLength(1);
    expect(miss.content).toBe(file);
    expect(miss.replacements).toBe(0);
    expect(edit(file, 'if (x) {\n\trun();\n}', 'nothing').issues).toHaveLength(1);
  });

  test('"or fuzzy matching": a different case or a near miss is not found', () => {
    expect(edit('Original Text', 'original text', 'x').issues).toHaveLength(1);
    expect(edit('original  text', 'original text', 'x').issues).toHaveLength(1);
  });

  test('"must appear exactly once": a text found twice is refused and the file is unchanged', () => {
    const file = 'foo()\nbar()\nfoo()\n';
    const refused = edit(file, 'foo()', 'baz()');
    expect(refused.issues).toHaveLength(1);
    expect(refused.issues[0]?.severity).toBe('error');
    expect(refused.issues[0]?.path).toBe('tool_input.old_string');
    expect(refused.content).toBe(file);
    expect(refused.replacements).toBe(0);
  });

  test('a longer string with surrounding context pins down one occurrence', () => {
    const file = 'foo()\nbar()\nfoo()\n';
    const done = edit(file, 'bar()\nfoo()', 'bar()\nbaz()');
    expect(done.issues).toEqual([]);
    expect(done.content).toBe('foo()\nbar()\nbaz()\n');
  });
});

spec('tools.input.Edit.new_string', () => {
  test('replaces the found text with the replacement text', () => {
    expect(edit('original text', 'original text', 'replacement text').content).toBe(
      'replacement text',
    );
  });

  test('an empty replacement deletes the found text', () => {
    expect(edit('keep drop keep', ' drop', '').content).toBe('keep keep');
  });

  test('the replacement is plain text: "$&", "$1" and "$$" are written as they are', () => {
    expect(edit('price', 'price', '$& $1 $$ $`').content).toBe('$& $1 $$ $`');
    expect(edit('a a', 'a', '$&$&', true).content).toBe('$&$& $&$&');
  });

  test('a replacement that contains the found text is not replaced again', () => {
    expect(edit('x y', 'x', 'xx', true).content).toBe('xx y');
  });
});

spec('tools.input.Edit.replace_all', () => {
  test('"Whether to replace all occurrences": true replaces every one and counts them', () => {
    const done = edit('foo bar foo baz foo', 'foo', 'qux', true);
    expect(done.issues).toEqual([]);
    expect(done.content).toBe('qux bar qux baz qux');
    expect(done.replacements).toBe(3);
  });

  test('false, as in the hooks.md example, and an omitted flag replace one occurrence only', () => {
    expect(edit('foo bar', 'foo', 'qux', false).content).toBe('qux bar');
    expect(edit('foo bar', 'foo', 'qux', undefined).content).toBe('qux bar');
    const twice = edit('foo foo', 'foo', 'qux', false);
    expect(twice.issues).toHaveLength(1);
    expect(twice.content).toBe('foo foo');
  });

  test('"sets `replace_all: true` to replace them all": the uniqueness check no longer applies', () => {
    expect(edit('foo foo', 'foo', 'qux').issues).toHaveLength(1);
    expect(edit('foo foo', 'foo', 'qux', true).issues).toEqual([]);
  });

  test('replace_all does not make a missing text match: "Match" still has to pass', () => {
    const miss = edit('foo', 'bar', 'qux', true);
    expect(miss.issues).toHaveLength(1);
    expect(miss.content).toBe('foo');
  });
});

const file = (...bytes: number[]) => Uint8Array.from(bytes);

spec(['tools.tool.Edit', 'tools.tool.Write'], () => {
  const WINDOWS_1252 = file(0x63, 0x61, 0x66, 0xe9); // "café" with a lone 0xE9
  const UTF_8 = new TextEncoder().encode('café');
  const UTF_16LE = file(0xff, 0xfe, 0x63, 0x00, 0x61, 0x00);

  test('Edit and NotebookEdit refuse a file whose bytes are not UTF-8, with the documented message', () => {
    for (const tool of ['Edit', 'NotebookEdit'] as const) {
      const refused = editEncodingIssue(WINDOWS_1252, tool);
      expect(refused?.severity).toBe('error');
      expect(refused?.message).toBe(
        'File is not valid UTF-8. It may use a legacy encoding such as Windows-1252, Shift-JIS or GBK, or be binary. This tool saves the whole file as UTF-8, which would replace every byte it cannot decode with U+FFFD. Nothing was written. Make the change with a shell command that reads and writes the file in its own encoding, or ask the user whether to convert the file to UTF-8 first.',
      );
      expect(refused?.message).toBe(NOT_UTF8_MESSAGE);
    }
  });

  test('"even one invalid byte sequence" refuses a file that is meant to be UTF-8', () => {
    const mostly = new Uint8Array([...UTF_8, 0xc3, 0x28]);
    expect(editEncodingIssue(mostly, 'Edit')).toBeDefined();
  });

  test('valid UTF-8, plain ASCII and an empty file are editable', () => {
    expect(editEncodingIssue(UTF_8, 'Edit')).toBeUndefined();
    expect(editEncodingIssue(new TextEncoder().encode('ascii'), 'NotebookEdit')).toBeUndefined();
    expect(editEncodingIssue(file(), 'Edit')).toBeUndefined();
  });

  test('"unless the file starts with a little-endian UTF-16 byte-order mark": Edit only', () => {
    expect(editEncodingIssue(UTF_16LE, 'Edit')).toBeUndefined();
    expect(editEncodingIssue(UTF_16LE, 'NotebookEdit')).toBeDefined();
  });
});

spec('tools.tool.Write', () => {
  const legacy = Uint8Array.from([0x63, 0x61, 0x66, 0xe9]);

  test('"Claude can still replace such a file with Write": clean new content is accepted', () => {
    expect(writeEncodingIssue(legacy, 'cafe\n')).toBeUndefined();
    expect(writeEncodingIssue(legacy, 'café')).toBeUndefined();
  });

  test('"unless the new content contains U+FFFD": the garbled text Read showed is not written back', () => {
    const refused = writeEncodingIssue(legacy, 'caf\uFFFD');
    expect(refused?.severity).toBe('error');
    expect(refused?.path).toBe('tool_input.content');
    expect(writeEncodingIssue(legacy, '\uFFFD')).toBeDefined();
  });
});

describe('judgments (spec/judgments.md): what the docs leave open in the Edit tool', () => {
  test('the U+FFFD guard of Write applies only when it replaces a file that is not valid UTF-8', () => {
    const utf8 = new TextEncoder().encode('fine');
    expect(writeEncodingIssue(utf8, '\uFFFD')).toBeUndefined();
    expect(writeEncodingIssue(undefined, '\uFFFD')).toBeUndefined();
  });

  test('a file that starts with a UTF-16 little-endian mark is not "such a file" for Write', () => {
    expect(writeEncodingIssue(Uint8Array.from([0xff, 0xfe, 0x61, 0x00]), '\uFFFD')).toBeUndefined();
  });

  test('an empty old_string is refused (there is no text to find)', () => {
    const refused = edit('abc', '', 'x');
    expect(refused.issues).toHaveLength(1);
    expect(refused.issues[0]?.path).toBe('tool_input.old_string');
    expect(refused.content).toBe('abc');
  });

  test('occurrences are counted left to right without overlap', () => {
    expect(edit('aaa', 'aa', 'X').content).toBe('Xa');
    expect(edit('aaaa', 'aa', 'X', true).content).toBe('XX');
  });

  test('the wording of the refusals names the field and what to do', () => {
    expect(edit('abc', 'zzz', 'x').issues[0]?.message).toContain('not found');
    expect(edit('aa', 'a', 'x').issues[0]?.message).toContain('2 times');
    expect(edit('aa', 'a', 'x').issues[0]?.message).toContain('replace_all');
  });
});
