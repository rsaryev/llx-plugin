/**
 * A tokenizer for the JavaScript of a workflow script (workflows.md, "What the saved script looks
 * like", "Edit a saved script"). The kit never runs a script and never parses it fully: it needs to
 * tell code from the text that only looks like code (comments, strings, template text, regular
 * expressions) and to read a literal. So this keeps words, numbers, strings and one-character
 * punctuation (`...` is one token), skips comments, and puts the tokens of a template's `${...}` in
 * the stream right after the template's own token.
 */

const TOKEN_FORMS = ['word', 'number', 'string', 'regex', 'punct'] as const;
export type TokenForm = (typeof TOKEN_FORMS)[number];

export interface JsToken {
  readonly form: TokenForm;
  /** The source text of the token. */
  readonly text: string;
  readonly start: number;
  readonly end: number;
  /** A string's decoded text; `undefined` for a template with a `${...}` in it. */
  readonly value?: string;
}

export interface JsTokens {
  readonly tokens: readonly JsToken[];
  /** Why the text cannot be JavaScript at all: an unterminated string, comment, template or regex. */
  readonly problem: string | undefined;
}

const SIMPLE_ESCAPES: Readonly<Record<string, string>> = {
  n: '\n',
  t: '\t',
  r: '\r',
  b: '\b',
  f: '\f',
  v: '\v',
  '0': '\0',
};

const WORD = /[\p{ID_Start}_$][\p{ID_Continue}$‌‍]*/uy;
const NUMBER =
  /0[xX][\da-fA-F_]+n?|0[bB][01_]+n?|0[oO][0-7_]+n?|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d+)?n?/y;
const SPACE = /\s+/y;
const HEX2 = /[\da-fA-F]{2}/y;
const UNICODE = /\{([\da-fA-F]+)\}|[\da-fA-F]{4}/y;

/** After one of these words a `/` starts a regular expression. */
const REGEX_AFTER_WORD = new Set([
  'return',
  'typeof',
  'instanceof',
  'in',
  'of',
  'new',
  'delete',
  'void',
  'throw',
  'case',
  'do',
  'else',
  'yield',
  'await',
]);
const DIVISION_AFTER_PUNCT = new Set([')', ']', '}']);

const matchAt = (pattern: RegExp, text: string, at: number): RegExpExecArray | null => {
  pattern.lastIndex = at;
  return pattern.exec(text);
};

class Scanner {
  readonly tokens: JsToken[] = [];
  problem: string | undefined;
  private at = 0;
  private previous: JsToken | undefined;

  constructor(private readonly text: string) {}

  /** Scans to the end, or (inside a template) to the `}` that closes the `${`. */
  run(inTemplate: boolean): void {
    let depth = 0;
    while (this.problem === undefined && this.skipTrivia()) {
      const char = this.text[this.at] ?? '';
      if (inTemplate && char === '}' && depth === 0) return;
      depth += char === '{' ? 1 : char === '}' ? -1 : 0;
      this.next(char);
    }
  }

  private fail(message: string): void {
    this.problem ??= message;
  }

  /** Skips whitespace and comments; false at the end of the text. */
  private skipTrivia(): boolean {
    for (;;) {
      const space = matchAt(SPACE, this.text, this.at);
      if (space) this.at += space[0].length;
      const pair = this.text.slice(this.at, this.at + 2);
      if (pair === '//') this.at = this.lineEnd();
      else if (pair === '/*') this.blockComment();
      else if (!space) return this.at < this.text.length && this.problem === undefined;
      if (this.problem !== undefined) return false;
    }
  }

  private lineEnd(): number {
    const end = this.text.indexOf('\n', this.at);
    return end === -1 ? this.text.length : end;
  }

  private blockComment(): void {
    const end = this.text.indexOf('*/', this.at + 2);
    if (end === -1) this.fail('unterminated comment');
    else this.at = end + 2;
  }

  private push(token: JsToken): void {
    this.tokens.push(token);
    this.previous = token;
  }

  private next(char: string): void {
    const start = this.at;
    if (char === "'" || char === '"') return this.quoted(char);
    if (char === '`') return this.template();
    const word = matchAt(WORD, this.text, start);
    if (word) return this.take('word', word[0].length);
    const number = matchAt(NUMBER, this.text, start);
    if (number) return this.take('number', number[0].length);
    if (char === '/' && this.regexAllowed()) return this.regex();
    this.take('punct', this.text.startsWith('...', start) ? 3 : 1);
  }

  private take(form: TokenForm, length: number): void {
    const start = this.at;
    this.at += length;
    this.push({ form, text: this.text.slice(start, this.at), start, end: this.at });
  }

  private regexAllowed(): boolean {
    const before = this.previous;
    if (before === undefined) return true;
    if (before.form === 'punct') return !DIVISION_AFTER_PUNCT.has(before.text);
    return before.form === 'word' && REGEX_AFTER_WORD.has(before.text);
  }

  private regex(): void {
    const start = this.at;
    let at = start + 1;
    let inClass = false;
    for (; at < this.text.length; at++) {
      const char = this.text[at] ?? '';
      if (char === '\n') break;
      if (char === '\\') at++;
      else if (char === '[') inClass = true;
      else if (char === ']') inClass = false;
      else if (char === '/' && !inClass) return this.finishRegex(start, at + 1);
    }
    this.take('punct', 1);
  }

  private finishRegex(start: number, bodyEnd: number): void {
    const flags = matchAt(WORD, this.text, bodyEnd);
    this.at = bodyEnd + (flags ? flags[0].length : 0);
    this.push({ form: 'regex', text: this.text.slice(start, this.at), start, end: this.at });
  }

  private quoted(quote: string): void {
    const start = this.at++;
    let value = '';
    while (this.at < this.text.length) {
      const char = this.text[this.at++] ?? '';
      if (char === quote) {
        return this.push({
          form: 'string',
          text: this.text.slice(start, this.at),
          start,
          end: this.at,
          value,
        });
      }
      if (char === '\n') break;
      value += char === '\\' ? this.escape() : char;
    }
    this.fail('unterminated string');
  }

  /** The character an escape stands for; `this.at` is just after the backslash. */
  private escape(): string {
    const char = this.text[this.at++] ?? '';
    const simple = SIMPLE_ESCAPES[char];
    if (simple !== undefined) return simple;
    if (char === 'x') return this.numeric(HEX2, 'x');
    if (char === 'u') return this.unicode();
    if (char === '\r' && this.text[this.at] === '\n') this.at++;
    return char === '\n' || char === '\r' ? '' : char;
  }

  private numeric(pattern: RegExp, fallback: string): string {
    const found = matchAt(pattern, this.text, this.at);
    if (!found) return fallback;
    this.at += found[0].length;
    return String.fromCodePoint(Number.parseInt(found[0], 16));
  }

  private unicode(): string {
    const found = matchAt(UNICODE, this.text, this.at);
    if (!found) return 'u';
    this.at += found[0].length;
    const code = Number.parseInt(found[1] ?? found[0], 16);
    return code > 0x10ffff ? '' : String.fromCodePoint(code);
  }

  private template(): void {
    const start = this.at++;
    const index = this.tokens.length;
    let value: string | undefined = '';
    const inner: JsToken[] = [];
    while (this.at < this.text.length && this.problem === undefined) {
      const char = this.text[this.at++] ?? '';
      if (char === '`') return this.closeTemplate(start, index, value, inner);
      if (char === '$' && this.text[this.at] === '{') {
        value = undefined;
        this.at++;
        inner.push(...this.interpolation());
      } else if (value !== undefined) value += char === '\\' ? this.escape() : char;
      else if (char === '\\') this.escape();
    }
    this.fail('unterminated template');
  }

  /** The tokens of one `${...}`, scanned by a scanner of their own. */
  private interpolation(): JsToken[] {
    const inner = new Scanner(this.text);
    inner.at = this.at;
    inner.run(true);
    this.problem ??= inner.problem;
    this.at = inner.at + 1;
    return inner.tokens;
  }

  private closeTemplate(
    start: number,
    index: number,
    value: string | undefined,
    inner: JsToken[],
  ): void {
    const token: JsToken = {
      form: 'string',
      text: this.text.slice(start, this.at),
      start,
      end: this.at,
      ...(value === undefined ? {} : { value }),
    };
    this.tokens.splice(index, 0, token, ...inner);
    this.previous = token;
  }
}

/** Tokens of `text`; never throws. */
export function tokenize(text: string): JsTokens {
  const scanner = new Scanner(text);
  scanner.run(false);
  return { tokens: scanner.tokens, problem: scanner.problem };
}
