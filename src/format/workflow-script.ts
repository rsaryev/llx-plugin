import { warning, error, type PluginIssue } from './issues.ts';
import type { JsToken } from './js-tokens.ts';
import { readScriptHead, type WorkflowMeta } from './workflow-meta.ts';

/**
 * What the kit can say about a workflow script without running it (workflows.md, "Edit a saved
 * script", "Behavior and limits"): the stage titles `phase()` is called with against `meta.phases`,
 * whether the body reads `args`, the calls that throw inside the script (`Date.now()`,
 * `Math.random()`, a no-argument `new Date()`) and `import()`, which fails before the run starts.
 * Comments, strings, template text and regular expressions are never code. A syntax error in the body
 * is the runtime's to report ("Claude Code reports it when you run the workflow"), not the kit's.
 */

export interface PhaseReport {
  /** The titles of `meta.phases`. */
  readonly declared: readonly string[];
  /** The titles `phase()` is called with as a literal, once each, in order. */
  readonly used: readonly string[];
  /** Used and not declared: "a `phase()` title with no entry gets a progress group of its own". */
  readonly ownGroup: readonly string[];
  /** Declared and never used. */
  readonly unused: readonly string[];
}

export interface ScriptReport {
  readonly meta: WorkflowMeta | undefined;
  readonly issues: readonly PluginIssue[];
  /** The script up to the end of the `meta` statement; `header + body` is the script. */
  readonly header: string;
  readonly body: string;
  readonly phases: PhaseReport;
  /** The body reads the `args` global (workflows.md, "Pass input to a saved workflow"). */
  readonly readsArgs: boolean;
}

type Tokens = readonly JsToken[];

const isPunct = (token: JsToken | undefined, text: string): boolean =>
  token?.form === 'punct' && token.text === text;
const isWord = (token: JsToken | undefined, text: string): boolean =>
  token?.form === 'word' && token.text === text;
const isCall = (tokens: Tokens, index: number): boolean =>
  isPunct(tokens[index + 1], '(') && !isPunct(tokens[index - 1], '.');

/** The titles `phase()` is called with: `titles` as literals, and how many calls had another argument. */
function phaseCalls(tokens: Tokens): { titles: string[]; computed: number } {
  const titles: string[] = [];
  let computed = 0;
  tokens.forEach((token, index) => {
    if (!isWord(token, 'phase') || !isCall(tokens, index)) return;
    const title = tokens[index + 2];
    const after = tokens[index + 3];
    const literal = title?.form === 'string' && title.value !== undefined;
    if (literal && (isPunct(after, ')') || isPunct(after, ','))) titles.push(title.value ?? '');
    else computed++;
  });
  return { titles, computed };
}

const unique = (titles: readonly string[]): string[] => [...new Set(titles)];

function phaseReport(
  declared: readonly string[],
  calls: { titles: string[]; computed: number },
): PhaseReport {
  const used = unique(calls.titles);
  const known = new Set(declared);
  const ownGroup = declared.length === 0 ? [] : used.filter((title) => !known.has(title));
  const unused = calls.computed > 0 ? [] : declared.filter((title) => !used.includes(title));
  return { declared, used, ownGroup, unused };
}

function phaseIssues(report: PhaseReport): PluginIssue[] {
  return [
    ...report.ownGroup.map((title) =>
      warning(
        'meta.phases',
        `phase("${title}") has no entry in meta.phases, so it gets a progress group of its own`,
      ),
    ),
    ...report.unused.map((title) =>
      warning('meta.phases', `meta.phases lists "${title}" but no phase("${title}") call uses it`),
    ),
  ];
}

/** `args` as a name: not a property (`ctx.args`) and not an object key (`{ args: 1 }`). */
function readsArgs(tokens: Tokens): boolean {
  return tokens.some((token, index) => {
    if (!isWord(token, 'args') || isPunct(tokens[index - 1], '.')) return false;
    const key =
      isPunct(tokens[index + 1], ':') && ['{', ','].includes(tokens[index - 1]?.text ?? '');
    return !key;
  });
}

const THROWS =
  'throws inside a workflow script, so that a relaunched run repeats the same agent() calls';

/** One finding of a scan over the tokens: where it is and what it says. */
interface Finding {
  readonly at: number;
  readonly severity: 'error' | 'warning';
  readonly message: string;
}

/** The script's globals the scan looks for by name: the kit never calls them (the layers gate forbids it), it only reads their names in a script. */
const CLOCK = 'Date';
const RANDOM_OWNER = 'Math';

const staticCall =
  (owner: string, member: string) =>
  (tokens: Tokens): Finding[] =>
    tokens.flatMap((token, index): Finding[] => {
      const matches =
        isWord(token, owner) &&
        !isPunct(tokens[index - 1], '.') &&
        isPunct(tokens[index + 1], '.') &&
        isWord(tokens[index + 2], member) &&
        isPunct(tokens[index + 3], '(');
      const message = `${owner}.${member}() ${THROWS}; pass a timestamp or a seed in through args instead`;
      return matches ? [{ at: token.start, severity: 'warning', message }] : [];
    });

/** A no-argument construction of the clock global: with `()` and nothing inside, or without parentheses and not followed by a member. */
function newDate(tokens: Tokens): Finding[] {
  return tokens.flatMap((token, index): Finding[] => {
    if (!isWord(token, 'new') || !isWord(tokens[index + 1], CLOCK)) return [];
    const open = isPunct(tokens[index + 2], '(');
    const empty = open ? isPunct(tokens[index + 3], ')') : !isPunct(tokens[index + 2], '.');
    const message = `a no-argument new ${CLOCK}() ${THROWS}; pass a timestamp in through args instead`;
    return empty ? [{ at: token.start, severity: 'warning', message }] : [];
  });
}

/** "a script that contains `import()` fails before the run starts". */
function importCalls(tokens: Tokens): Finding[] {
  return tokens.flatMap((token, index): Finding[] => {
    if (!isWord(token, 'import') || !isCall(tokens, index)) return [];
    const message =
      "import() fails before the run starts: a workflow script cannot load modules; put work that needs a library in an agent's task";
    return [{ at: token.start, severity: 'error', message }];
  });
}

const SCANS: readonly ((tokens: Tokens) => Finding[])[] = [
  staticCall(CLOCK, 'now'),
  staticCall(RANDOM_OWNER, 'random'),
  newDate,
  importCalls,
];

const lineOf = (source: string, at: number): number => source.slice(0, at).split('\n').length;

function scanIssues(source: string, tokens: Tokens): PluginIssue[] {
  return SCANS.flatMap((scan) => scan(tokens))
    .toSorted((first, second) => first.at - second.at)
    .map((found) => {
      const path = `script:${lineOf(source, found.at)}`;
      return found.severity === 'error' ? error(path, found.message) : warning(path, found.message);
    });
}

const EMPTY: PhaseReport = { declared: [], used: [], ownGroup: [], unused: [] };

/** Inspects a workflow script. Never runs it and never throws. */
export function inspectWorkflowScript(source: string): ScriptReport {
  const head = readScriptHead(source);
  if (head.object === undefined) {
    return {
      meta: undefined,
      issues: head.issues,
      header: '',
      body: source,
      phases: EMPTY,
      readsArgs: false,
    };
  }
  const tokens = head.tokens.slice(head.bodyIndex);
  const phases = phaseReport(head.meta?.phases ?? [], phaseCalls(tokens));
  return {
    meta: head.meta,
    issues: [...head.issues, ...phaseIssues(phases), ...scanIssues(source, tokens)],
    header: source.slice(0, head.headEnd),
    body: source.slice(head.headEnd),
    phases,
    readsArgs: readsArgs(tokens),
  };
}
