/**
 * hooks.md § AskUserQuestion (PreToolUse input) and § Tools that require user interaction.
 * `questions` holds "one to four" multiple-choice questions, "each with a `question` string, short
 * `header`, `options` array, and optional `multiSelect` flag". `answers` is optional: it "maps
 * question text to the selected option label. Multi-select answers join labels with commas. Claude
 * doesn't set this field; supply it via `updatedInput` to answer programmatically". A hook answers by
 * echoing the original `questions` and adding `answers`. The 2 to 4 options of a question come from
 * the SDK's input type (the table says "options array"), a judgment in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import { answerQuestions, parseToolInput } from '../../src/rules/index.ts';
import { spec } from '../support/spec.ts';

const option = (label: string) => ({ label, description: `${label} description` });
const question = (text: string, labels: readonly string[], multiSelect?: boolean) => ({
  question: text,
  header: 'Header',
  options: labels.map(option),
  ...(multiSelect === undefined ? {} : { multiSelect }),
});

// hooks.md § AskUserQuestion, the example row.
const FRAMEWORK = question('Which framework?', ['React', 'Vue'], false);

const many = (count: number) =>
  Array.from({ length: count }, (_, index) => question(`Q${index}?`, ['a', 'b']));

const paths = (raw: unknown): string[] =>
  parseToolInput('AskUserQuestion', raw).issues.map((found) => found.path);

spec('tools.input.AskUserQuestion.questions', () => {
  test('the documented example is accepted', () => {
    const raw = { questions: [FRAMEWORK] };
    const parse = parseToolInput('AskUserQuestion', raw);
    expect(parse.issues).toEqual([]);
    expect(parse.input).toEqual(raw);
  });

  test('one to four questions: none and five are refused', () => {
    for (const count of [1, 2, 3, 4]) expect(paths({ questions: many(count) })).toEqual([]);
    for (const count of [0, 5])
      expect(paths({ questions: many(count) })).toEqual(['tool_input.questions']);
  });

  test('each question needs a question string, a header and an options array', () => {
    expect(paths({ questions: [{ header: 'h', options: [option('a'), option('b')] }] })).toEqual([
      'tool_input.questions.0.question',
    ]);
    expect(paths({ questions: [{ question: 'q?', options: [option('a'), option('b')] }] })).toEqual(
      ['tool_input.questions.0.header'],
    );
    expect(paths({ questions: [{ question: 'q?', header: 'h' }] })).toEqual([
      'tool_input.questions.0.options',
    ]);
  });

  test('multiSelect is optional and must be a boolean', () => {
    expect(paths({ questions: [question('q?', ['a', 'b'])] })).toEqual([]);
    expect(paths({ questions: [question('q?', ['a', 'b'], true)] })).toEqual([]);
    const wrong = { ...question('q?', ['a', 'b']), multiSelect: 'yes' };
    expect(paths({ questions: [wrong] })).toEqual(['tool_input.questions.0.multiSelect']);
  });

  test('an option has a label and a description', () => {
    const broken = { ...question('q?', ['a', 'b']), options: [{ label: 'a' }, option('b')] };
    expect(paths({ questions: [broken] })).toEqual([
      'tool_input.questions.0.options.0.description',
    ]);
  });

  test('questions must be an array', () => {
    expect(paths({ questions: FRAMEWORK })).toEqual(['tool_input.questions']);
    expect(paths({})).toEqual(['tool_input.questions']);
  });
});

describe('the options of a question (judgment: the SDK type says 2 to 4)', () => {
  test('one option or five are refused', () => {
    expect(paths({ questions: [question('q?', ['a'])] })).toEqual([
      'tool_input.questions.0.options',
    ]);
    expect(paths({ questions: [question('q?', ['a', 'b', 'c', 'd', 'e'])] })).toEqual([
      'tool_input.questions.0.options',
    ]);
    expect(paths({ questions: [question('q?', ['a', 'b', 'c', 'd'])] })).toEqual([]);
  });

  test('an option preview is an optional string', () => {
    const preview = {
      ...question('q?', ['a', 'b']),
      options: [{ ...option('a'), preview: 'x' }, option('b')],
    };
    expect(paths({ questions: [preview] })).toEqual([]);
  });
});

spec('tools.input.AskUserQuestion.answers', () => {
  test('answers maps question text to the selected option label', () => {
    const raw = { questions: [FRAMEWORK], answers: { 'Which framework?': 'React' } };
    const parse = parseToolInput('AskUserQuestion', raw);
    expect(parse.issues).toEqual([]);
    expect(parse.input.answers).toEqual({ 'Which framework?': 'React' });
  });

  test('answers is optional: Claude does not set it', () => {
    expect(paths({ questions: [FRAMEWORK] })).toEqual([]);
  });

  test('every answer is text: a number, a list or a non-object answers is refused', () => {
    expect(paths({ questions: [FRAMEWORK], answers: { 'Which framework?': 3 } })).toEqual([
      'tool_input.answers.Which framework?',
    ]);
    expect(paths({ questions: [FRAMEWORK], answers: ['React'] })).toEqual(['tool_input.answers']);
  });

  test('answerQuestions echoes the questions and adds the label of the choice', () => {
    const input = { questions: [FRAMEWORK] };
    const { input: answered, issues } = answerQuestions(input, { 'Which framework?': ['React'] });
    expect(issues).toEqual([]);
    // The hook's updatedInput replaces the whole input, so the original questions come back too.
    expect(answered).toEqual({ questions: [FRAMEWORK], answers: { 'Which framework?': 'React' } });
    expect(parseToolInput('AskUserQuestion', answered).issues).toEqual([]);
  });

  test('a multi-select answer joins the labels with commas', () => {
    const features = question('Which features?', ['Auth', 'Billing', 'Search'], true);
    const { input } = answerQuestions(
      { questions: [FRAMEWORK, features] },
      { 'Which framework?': ['Vue'], 'Which features?': ['Auth', 'Search'] },
    );
    expect(input.answers).toEqual({ 'Which framework?': 'Vue', 'Which features?': 'Auth,Search' });
  });

  test('the input it is given is left as it was', () => {
    const input = { questions: [FRAMEWORK] };
    answerQuestions(input, { 'Which framework?': ['React'] });
    expect(input).toEqual({ questions: [FRAMEWORK] });
  });
});

describe('answerQuestions where the docs are silent (judgments, spec/judgments.md)', () => {
  test('an answer for a question that was not asked is an issue and is not added', () => {
    const { input, issues } = answerQuestions(
      { questions: [FRAMEWORK] },
      { 'Which editor?': ['vim'] },
    );
    expect(issues.map(({ severity, path }) => [severity, path])).toEqual([
      ['error', 'tool_input.answers.Which editor?'],
    ]);
    expect(input.answers).toEqual({});
  });

  test('two labels for a single-select question is an issue and the question stays unanswered', () => {
    const { input, issues } = answerQuestions(
      { questions: [FRAMEWORK] },
      { 'Which framework?': ['React', 'Vue'] },
    );
    expect(issues.map((found) => found.path)).toEqual(['tool_input.answers.Which framework?']);
    expect(input.answers).toEqual({});
  });

  test('no selection leaves the question unanswered', () => {
    const { input, issues } = answerQuestions(
      { questions: [FRAMEWORK] },
      { 'Which framework?': [] },
    );
    expect(issues).toEqual([]);
    expect(input.answers).toEqual({});
  });

  test('a text that is not an option label is kept: the user can write their own answer', () => {
    // The SDK's field description: no "Other" option is listed, "that will be provided automatically".
    const { input, issues } = answerQuestions(
      { questions: [FRAMEWORK] },
      { 'Which framework?': ['Svelte'] },
    );
    expect(issues).toEqual([]);
    expect(input.answers).toEqual({ 'Which framework?': 'Svelte' });
  });

  test('answers already in the input stay unless a selection replaces them', () => {
    const first = question('First?', ['a', 'b']);
    const { input } = answerQuestions(
      { questions: [first, FRAMEWORK], answers: { 'First?': 'a' } },
      { 'Which framework?': ['React'] },
    );
    expect(input.answers).toEqual({ 'First?': 'a', 'Which framework?': 'React' });
  });
});
