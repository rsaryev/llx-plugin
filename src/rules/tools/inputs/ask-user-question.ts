import { z } from 'zod';
import { error, type PluginIssue } from '../../../format/issues.ts';
import { flag, list, record, text } from './field-schemas.ts';

/**
 * AskUserQuestion's input (hooks.md, "AskUserQuestion"): "one to four" questions, "each with a
 * `question` string, short `header`, `options` array, and optional `multiSelect` flag". The table
 * says only "options array"; two to four options per question is the SDK's input type
 * (spec/judgments.md). The `header` limit of 12 characters the SDK's comment gives is not enforced:
 * the docs say "short", and a long chip label still asks the question.
 */
const option = z.looseObject({
  label: text,
  description: text,
  preview: text.optional(),
});

/**
 * A count between `least` and `most`. A refinement and not `.min().max()`: those length checks also
 * run on a string, which would add a second issue to a value that is not an array.
 */
const between = (least: number, most: number, what: string) => ({
  check: (items: readonly unknown[]): boolean => items.length >= least && items.length <= most,
  params: { error: `expected ${least} to ${most} ${what}` },
});

const options = between(2, 4, 'options');
const question = z.looseObject({
  question: text,
  header: text,
  options: list(option).refine(options.check, options.params),
  multiSelect: flag.optional(),
});

const questions = between(1, 4, 'questions');
export const questionsSchema = list(question).refine(questions.check, questions.params);

/** "Maps question text to the selected option label". */
export const answersSchema = record(text);

/** What `answerQuestions` needs of an AskUserQuestion input; the SDK's `AskUserQuestionInput` has it. */
export interface AskedQuestions {
  readonly questions: readonly { readonly question: string; readonly multiSelect?: boolean }[];
  readonly answers?: Readonly<Record<string, string>>;
}

export interface AnsweredQuestions<T extends AskedQuestions> {
  /** The whole input with `answers`, ready to be a hook's `updatedInput`. */
  readonly input: T & { readonly answers: Readonly<Record<string, string>> };
  readonly issues: readonly PluginIssue[];
}

const rejected = (path: string, message: string): PluginIssue =>
  error(`tool_input.answers.${path}`, message);

/**
 * Answers a call programmatically (hooks.md, "Tools that require user interaction"): "echo back the
 * original `questions` array and add an `answers` object mapping each question's text to the chosen
 * answer", the labels of a multi-select question joined with commas. `selections` maps a question's
 * text to what the user chose. Judgments (spec/judgments.md): a selection for a question that was
 * not asked, or two or more for a single-select question, is an issue and adds nothing; no
 * selection leaves the question unanswered; a text that is no option label stays, because the user
 * can write their own answer; answers already in the input stay unless a selection replaces them.
 */
export function answerQuestions<T extends AskedQuestions>(
  input: T,
  selections: Readonly<Record<string, readonly string[]>>,
): AnsweredQuestions<T> {
  const asked = new Map(
    input.questions.map((entry) => [entry.question, entry.multiSelect === true]),
  );
  const answers: Record<string, string> = { ...input.answers };
  const issues: PluginIssue[] = [];
  for (const [questionText, chosen] of Object.entries(selections)) {
    const multiple = asked.get(questionText);
    if (multiple === undefined) {
      issues.push(rejected(questionText, 'is not one of the questions asked'));
    } else if (chosen.length > 1 && !multiple) {
      issues.push(rejected(questionText, 'is a single-select question and takes one answer'));
    } else if (chosen.length > 0) {
      answers[questionText] = chosen.join(',');
    }
  }
  return { input: { ...input, answers }, issues };
}
