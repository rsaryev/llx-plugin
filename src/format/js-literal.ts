import type { JsToken } from './js-tokens.ts';
import { isStackOverflow, stackMessage } from './js-parse.ts';

/**
 * Reads a JavaScript object literal from tokens without running anything: strings, numbers, `true`,
 * `false`, `null`, arrays and objects. A variable, a call, a spread, a computed key, a method, a
 * shorthand property or an expression is not a literal (workflows.md, "Edit a saved script", the
 * `meta` block: "If it contains anything other than literal values, such as a variable, a function
 * call, or a spread, Claude Code drops `/<name>` from `/` autocomplete").
 */

export interface LiteralProperty {
  readonly key: string;
  readonly value: unknown;
  /** Where the value starts and ends in the source. */
  readonly valueStart: number;
  readonly valueEnd: number;
}

export interface LiteralObject {
  /** The `{` and the end of the `}`. */
  readonly start: number;
  readonly end: number;
  /** The position of the `}` itself. */
  readonly closeAt: number;
  readonly properties: readonly LiteralProperty[];
  /** The last property is followed by a comma. */
  readonly trailingComma: boolean;
  /** The end of the last property and of its comma, if any; just after the `{` when there is none. */
  readonly afterLast: number;
  /** The index of the token after the `}`. */
  readonly endIndex: number;
}

export type LiteralRead =
  | { readonly found: LiteralObject; readonly problem?: undefined }
  | { readonly found?: undefined; readonly problem: string };

/** Stands in for a token once the read has failed, so the methods that follow read nothing and stop. */
const NO_TOKEN: JsToken = { form: 'punct', text: '', start: 0, end: 0 };

/** Where a property added after the last one goes: after its comma when it has one. */
function afterLast(
  open: JsToken,
  last: LiteralProperty | undefined,
  before: JsToken | undefined,
): number {
  if (last === undefined) return open.end;
  return before?.text === ',' ? before.end : last.valueEnd;
}

const WORDS: Readonly<Record<string, boolean | null>> = { true: true, false: false, null: null };

class Reader {
  /** The first reason the text is not a literal; once set, every read after it returns a placeholder. */
  problem: string | undefined;
  private index: number;
  private readonly tokens: readonly JsToken[];

  constructor(tokens: readonly JsToken[], from: number) {
    this.tokens = tokens;
    this.index = from;
  }

  private peek(): JsToken | undefined {
    return this.tokens[this.index];
  }

  /** Records the first problem and moves to the end, so no loop reads on. */
  private fail(message: string): void {
    this.problem ??= message;
    this.index = this.tokens.length;
  }

  private take(): JsToken {
    const token = this.peek();
    if (token === undefined) {
      this.fail('the text ends inside the literal');
      return NO_TOKEN;
    }
    this.index++;
    return token;
  }

  private expect(text: string): JsToken {
    const token = this.take();
    if (token.form !== 'punct' || token.text !== text) {
      this.fail(`expected "${text}" but found "${token.text}"`);
    }
    return token;
  }

  private atPunct(text: string): boolean {
    const token = this.peek();
    return token?.form === 'punct' && token.text === text;
  }

  private reading(closer: string): boolean {
    return this.problem === undefined && !this.atPunct(closer);
  }

  value(): unknown {
    const token = this.take();
    if (token.form === 'string') return this.text(token);
    if (token.form === 'number') return this.number(token.text, 1);
    if (token.form === 'word') return this.word(token);
    if (token.text === '-') return this.number(this.take().text, -1);
    if (token.text === '{') return this.object();
    if (token.text === '[') return this.array();
    this.fail(`"${token.text}" is not a literal`);
    return undefined;
  }

  private text(token: JsToken): string {
    if (token.value !== undefined) return token.value;
    this.fail('a template literal with ${...} is not a literal');
    return '';
  }

  private number(text: string, sign: number): number {
    const value = Number(text.replaceAll('_', ''));
    if (!Number.isNaN(value)) return sign * value;
    this.fail(`"${text}" is not a number literal`);
    return 0;
  }

  private word(token: JsToken): boolean | null {
    const known = WORDS[token.text];
    if (known !== undefined) return known;
    this.fail(`"${token.text}" is not a literal`);
    return null;
  }

  private array(): unknown[] {
    const items: unknown[] = [];
    while (this.reading(']')) {
      items.push(this.value());
      if (!this.atPunct(']')) this.expect(',');
    }
    this.expect(']');
    return items;
  }

  private key(): string {
    const token = this.take();
    if (token.form === 'word' || token.form === 'number') return token.text;
    if (token.form === 'string') return this.text(token);
    this.fail(`"${token.text}" is not a key`);
    return '';
  }

  private object(): Record<string, unknown> {
    return Object.fromEntries(this.properties().map((each) => [each.key, each.value]));
  }

  private properties(): LiteralProperty[] {
    const found: LiteralProperty[] = [];
    while (this.reading('}')) {
      found.push(this.property());
      if (!this.atPunct('}')) this.expect(',');
    }
    this.expect('}');
    return found;
  }

  private property(): LiteralProperty {
    const key = this.key();
    this.expect(':');
    const valueStart = this.peek()?.start ?? 0;
    const value = this.value();
    const last = this.tokens[this.index - 1];
    return { key, value, valueStart, valueEnd: last?.end ?? valueStart };
  }

  /** The object that starts at the current token; meaningless when `problem` is set after it. */
  objectLiteral(): LiteralObject {
    const open = this.expect('{');
    const properties = this.properties();
    const close = this.tokens[this.index - 1];
    const before = this.tokens[this.index - 2];
    return {
      start: open.start,
      end: close?.end ?? open.end,
      closeAt: close?.start ?? open.start,
      properties,
      trailingComma: before?.text === ',',
      afterLast: afterLast(open, properties.at(-1), before),
      endIndex: this.index,
    };
  }
}

/** The object literal that starts at `tokens[from]`, or why it is not a literal. Never throws. */
export function readObjectLiteral(tokens: readonly JsToken[], from: number): LiteralRead {
  const reader = new Reader(tokens, from);
  try {
    const found = reader.objectLiteral();
    return reader.problem === undefined ? { found } : { problem: reader.problem };
  } catch (thrown) {
    // The reader recurses per nesting level; only running out of stack can throw (`isStackOverflow`).
    if (!isStackOverflow(thrown)) throw thrown;
    return { problem: `code nested too deep to read (${stackMessage(thrown)})` };
  }
}
