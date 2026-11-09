import type { ElicitationField, ElicitationFieldType } from './mcp-elicitation-form.ts';

/**
 * The check of one form value against its field (mcp.md, "Respond to MCP elicitation requests": the
 * person "fills in the fields and submits"). The docs do not say how the client checks them; the
 * constraints are those of the MCP form schema (`minimum`, `maximum`, `minLength`, `maxLength`,
 * `format`, `minItems`, `maxItems`, the listed options), and the wording is the kit's (spec/judgments.md).
 */

const bounded = (field: ElicitationField, value: number): string | undefined => {
  if (field.minimum !== undefined && value < field.minimum) {
    return `${field.name} must be at least ${field.minimum}`;
  }
  return field.maximum !== undefined && value > field.maximum
    ? `${field.name} must be at most ${field.maximum}`
    : undefined;
};

const oneOfMessage = (field: ElicitationField): string =>
  `${field.name} must be one of ${(field.options ?? []).join(', ')}`;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME =
  /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d+)?)?(Z|[+-]([01]\d|2[0-3]):[0-5]\d)?$/;

const isUrl = (value: string): boolean => URL.canParse(value);

/** A calendar date: the month exists and the day is in it (February has 29 days in a leap year). */
function isDate(value: string): boolean {
  const parts = DATE.exec(value);
  if (parts === null) return false;
  const [year, month, day] = parts.slice(1).map(Number);
  if (year === undefined || month === undefined || day === undefined) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return days !== undefined && day >= 1 && day <= days;
}

const isDateTime = (value: string): boolean => {
  const date = DATE_TIME.exec(value)?.[1];
  return date !== undefined && isDate(date);
};

/** One strategy per `format` of a string: what a value must be, and how the problem reads. */
const FORMATS: {
  readonly [F in NonNullable<ElicitationField['format']>]: {
    readonly fits: (value: string) => boolean;
    readonly expected: string;
  };
} = {
  email: { fits: (value) => EMAIL.test(value), expected: 'an email address' },
  uri: { fits: isUrl, expected: 'a full URL' },
  date: { fits: isDate, expected: 'a date (YYYY-MM-DD)' },
  'date-time': { fits: isDateTime, expected: 'a date and time (ISO 8601)' },
};

function lengthProblem(field: ElicitationField, value: string): string | undefined {
  if (field.minLength !== undefined && value.length < field.minLength) {
    return `${field.name} must have at least ${field.minLength} characters`;
  }
  return field.maxLength !== undefined && value.length > field.maxLength
    ? `${field.name} must have at most ${field.maxLength} characters`
    : undefined;
}

function formatProblem(field: ElicitationField, value: string): string | undefined {
  const format = field.format === undefined ? undefined : FORMATS[field.format];
  return format === undefined || format.fits(value)
    ? undefined
    : `${field.name} must be ${format.expected}`;
}

function listProblem(field: ElicitationField, value: unknown): string | undefined {
  const allowed = Array.isArray(value) && value.every((each) => field.options?.includes(each));
  if (!Array.isArray(value) || !allowed) return oneOfMessage(field);
  if (new Set(value).size !== value.length) return `${field.name} must choose each option once`;
  if (field.minItems !== undefined && value.length < field.minItems) {
    return `${field.name} must choose at least ${field.minItems}`;
  }
  return field.maxItems !== undefined && value.length > field.maxItems
    ? `${field.name} must choose at most ${field.maxItems}`
    : undefined;
}

/** One strategy per kind of field: the problem a value has, or `undefined`. */
const CHECKS: {
  readonly [T in ElicitationFieldType]: (
    field: ElicitationField,
    value: unknown,
  ) => string | undefined;
} = {
  string: (field, value) =>
    typeof value === 'string'
      ? (lengthProblem(field, value) ?? formatProblem(field, value))
      : `${field.name} must be text`,
  number: (field, value) =>
    typeof value === 'number' && Number.isFinite(value)
      ? bounded(field, value)
      : `${field.name} must be a number`,
  integer: (field, value) =>
    typeof value === 'number' && Number.isInteger(value)
      ? bounded(field, value)
      : `${field.name} must be a whole number`,
  boolean: (field, value) =>
    typeof value === 'boolean' ? undefined : `${field.name} must be a boolean`,
  enum: (field, value) =>
    typeof value === 'string' && field.options?.includes(value) === true
      ? undefined
      : oneOfMessage(field),
  'multi-enum': listProblem,
};

/** The problem `value` has as the value of `field`, or `undefined` when it fits. */
export const fieldProblem = (field: ElicitationField, value: unknown): string | undefined =>
  CHECKS[field.type](field, value);
