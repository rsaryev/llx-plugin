import type { JsToken } from './js-tokens.ts';

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

class NotLiteral extends Error {}

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
  private index: number;

  constructor(
    private readonly tokens: readonly JsToken[],
    from: number,
  ) {
    this.index = from;
  }

  private peek(): JsToken | undefined {
    return this.tokens[this.index];
  }

  private fail(message: string): never {
    throw new NotLiteral(message);
  }

  private take(): JsToken {
    const token = this.peek();
    if (token === undefined) return this.fail('the text ends inside the literal');
    this.index++;
    return token;
  }

  private expect(text: string): JsToken {
    const token = this.take();
    if (token.form !== 'punct' || token.text !== text) {
      return this.fail(`expected "${text}" but found "${token.text}"`);
    }
    return token;
  }

  private atPunct(text: string): boolean {
    const token = this.peek();
    return token?.form === 'punct' && token.text === text;
  }

  value(): unknown {
    const token = this.take();
    if (token.form === 'string') return this.text(token);
    if (token.form === 'number') return this.number(token.text, 1);
    if (token.form === 'word') return this.word(token);
    if (token.text === '-') return this.number(this.take().text, -1);
    if (token.text === '{') return this.object();
    if (token.text === '[') return this.array();
    return this.fail(`"${token.text}" is not a literal`);
  }

  private text(token: JsToken): string {
    return token.value ?? this.fail('a template literal with ${...} is not a literal');
  }

  private number(text: string, sign: number): number {
    const value = Number(text.replaceAll('_', ''));
    return Number.isNaN(value) ? this.fail(`"${text}" is not a number literal`) : sign * value;
  }

  private word(token: JsToken): boolean | null {
    const known = WORDS[token.text];
    return known === undefined ? this.fail(`"${token.text}" is not a literal`) : known;
  }

  private array(): unknown[] {
    const items: unknown[] = [];
    while (!this.atPunct(']')) {
      items.push(this.value());
      if (!this.atPunct(']')) this.expect(',');
    }
    this.expect(']');
    return items;
  }

  private key(): string {
    const token = this.take();
    if (token.form === 'word' || token.form === 'number') return token.text;
    return token.form === 'string' ? this.text(token) : this.fail(`"${token.text}" is not a key`);
  }

  private object(): Record<string, unknown> {
    return Object.fromEntries(this.properties().map((each) => [each.key, each.value]));
  }

  private properties(): LiteralProperty[] {
    const found: LiteralProperty[] = [];
    while (!this.atPunct('}')) {
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

  /** The object that starts at the current token. */
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

/** The object literal that starts at `tokens[from]`, or why it is not a literal. */
export function readObjectLiteral(tokens: readonly JsToken[], from: number): LiteralRead {
  const reader = new Reader(tokens, from);
  try {
    return { found: reader.objectLiteral() };
  } catch (thrown) {
    if (thrown instanceof NotLiteral) return { problem: thrown.message };
    throw thrown;
  }
}
