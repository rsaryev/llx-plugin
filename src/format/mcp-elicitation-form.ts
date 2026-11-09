import type { ElicitationRequest, ElicitationResult } from '../protocol/official.ts';
import { fieldProblem } from './mcp-elicitation-check.ts';

/**
 * The fields of a form-mode elicitation request and the check of an answer against them (mcp.md,
 * "Respond to MCP elicitation requests": "Claude Code shows a dialog with form fields defined by the
 * server"). Pure data: the dialog is the host's.
 */

export type ElicitationFieldType =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'enum'
  | 'multi-enum';

export interface ElicitationField {
  readonly name: string;
  readonly type: ElicitationFieldType;
  readonly required: boolean;
  readonly title?: string;
  readonly description?: string;
  /** The allowed values of an `enum` or `multi-enum` field. */
  readonly options?: readonly string[];
  /** What a dialog shows for each of `options`, in order: the `title` of a `oneOf` entry, an `enumNames` entry, else the value. */
  readonly labels?: readonly string[];
  /** The schema's `default`, when it is a value a form answer can hold. */
  readonly default?: ElicitationValue;
  /** A string's `format`, one of `email`, `uri`, `date` and `date-time`. */
  readonly format?: ElicitationFormat;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly minLength?: number;
  readonly maxLength?: number;
  /** A multi-select's bounds on how many options are chosen. */
  readonly minItems?: number;
  readonly maxItems?: number;
}

/** What MCP lets a form answer hold: text, a number, a boolean or a list of text. */
export type ElicitationValue = string | number | boolean | string[];

export const ELICITATION_FORMATS = ['email', 'uri', 'date', 'date-time'] as const;
export type ElicitationFormat = (typeof ELICITATION_FORMATS)[number];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const strings = (value: unknown): string[] | undefined =>
  Array.isArray(value) && value.every((each) => typeof each === 'string') ? value : undefined;

interface Choices {
  readonly options: string[];
  readonly labels: string[];
}

/** `oneOf` or `anyOf` of `{ const, title }` entries: the values, labelled by their titles. */
function constChoices(schema: Record<string, unknown>): Choices | undefined {
  const alternatives = [schema.oneOf, schema.anyOf].find(Array.isArray);
  const entries = alternatives?.filter(
    (each: unknown): each is Record<string, unknown> =>
      isRecord(each) && typeof each.const === 'string',
  );
  if (entries === undefined || entries.length !== alternatives?.length) return undefined;
  const options = entries.map((entry) => String(entry.const));
  const labels = entries.map((entry) =>
    typeof entry.title === 'string' ? entry.title : String(entry.const),
  );
  return { options, labels };
}

/** `enum: [...]` (labelled by a matching `enumNames`) or `oneOf: [{ const }]`, the ways the MCP schema lists the values of a choice. */
function choicesOf(schema: Record<string, unknown>): Choices | undefined {
  const listed = strings(schema.enum);
  if (listed === undefined) return constChoices(schema);
  const names = strings(schema.enumNames);
  return { options: listed, labels: names?.length === listed.length ? names : listed };
}

const SCALARS: Readonly<Record<string, ElicitationFieldType>> = {
  string: 'string',
  number: 'number',
  integer: 'integer',
  boolean: 'boolean',
};

const LIST_TYPES: ReadonlySet<unknown> = new Set(['array']);

/** Judgment (spec/judgments.md): a property with no type the kit knows is a text field. */
function typeOf(
  shape: Record<string, unknown>,
  choices: { items: Choices | undefined; own: Choices | undefined },
): ElicitationFieldType {
  if (LIST_TYPES.has(shape.type) && choices.items !== undefined) return 'multi-enum';
  if (choices.own !== undefined) return 'enum';
  const named =
    typeof shape.type === 'string' && Object.hasOwn(SCALARS, shape.type)
      ? SCALARS[shape.type]
      : undefined;
  return named ?? 'string';
}

const numberOf = (shape: Record<string, unknown>, key: string): { [k: string]: number } =>
  typeof shape[key] === 'number' ? { [key]: shape[key] } : {};

const textOf = (shape: Record<string, unknown>, key: string): { [k: string]: string } =>
  typeof shape[key] === 'string' ? { [key]: shape[key] } : {};

/** What MCP lets a form answer hold: text, a number, a boolean or a list of text. */
const isValue = (value: unknown): value is ElicitationValue =>
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean' ||
  strings(value) !== undefined;

/** What a form answer can hold: the schema's `default` when it is such a value. */
const defaultOf = (shape: Record<string, unknown>): { default?: ElicitationValue } =>
  isValue(shape.default) ? { default: shape.default } : {};

const formatOf = (shape: Record<string, unknown>): { format?: ElicitationFormat } => {
  const named = ELICITATION_FORMATS.find((format) => format === shape.format);
  return named === undefined ? {} : { format: named };
};

function fieldOf(name: string, schema: unknown, required: boolean): ElicitationField {
  const shape = isRecord(schema) ? schema : {};
  const items = isRecord(shape.items) ? choicesOf(shape.items) : undefined;
  const own = choicesOf(shape);
  const type = typeOf(shape, { items, own });
  const choices = type === 'multi-enum' ? items : type === 'enum' ? own : undefined;
  return {
    name,
    type,
    required,
    ...textOf(shape, 'title'),
    ...textOf(shape, 'description'),
    ...(choices === undefined ? {} : { options: choices.options, labels: choices.labels }),
    ...defaultOf(shape),
    ...formatOf(shape),
    ...numberOf(shape, 'minimum'),
    ...numberOf(shape, 'maximum'),
    ...numberOf(shape, 'minLength'),
    ...numberOf(shape, 'maxLength'),
    ...numberOf(shape, 'minItems'),
    ...numberOf(shape, 'maxItems'),
  };
}

/** The fields of a form request: its `requestedSchema` properties, in order, with `required` marked. */
export function elicitationFormFields(
  schema: Readonly<Record<string, unknown>> | undefined,
): readonly ElicitationField[] {
  const properties = schema?.properties;
  if (!isRecord(properties)) return [];
  const required = strings(schema?.required) ?? [];
  return Object.entries(properties).map(([name, each]) =>
    fieldOf(name, each, required.includes(name)),
  );
}

export const contentOf = (
  values: Readonly<Record<string, unknown>>,
): Record<string, ElicitationValue> =>
  Object.fromEntries(
    Object.entries(values).filter((entry): entry is [string, ElicitationValue] =>
      isValue(entry[1]),
    ),
  );

/**
 * The problem each field's value has, by field name; empty when the values fit. A field with no value
 * is a problem only when it is required. Judgment (spec/judgments.md): the wording is the kit's.
 */
export function elicitationFieldProblems(
  schema: Readonly<Record<string, unknown>> | undefined,
  values: Readonly<Record<string, unknown>>,
): Readonly<Record<string, string>> {
  const problems = elicitationFormFields(schema).flatMap((field): [string, string][] => {
    const value = Object.hasOwn(values, field.name) ? values[field.name] : undefined;
    if (value === undefined)
      return field.required ? [[field.name, `${field.name} is required`]] : [];
    const problem = fieldProblem(field, value);
    return problem === undefined ? [] : [[field.name, problem]];
  });
  return Object.fromEntries(problems);
}

export type ElicitationAnswer =
  | { readonly result: ElicitationResult }
  | { readonly problems: readonly string[] };

export function formAnswer(
  request: ElicitationRequest,
  values: Readonly<Record<string, unknown>>,
): ElicitationAnswer {
  const problems = Object.values(elicitationFieldProblems(request.requestedSchema, values));
  if (problems.length > 0) return { problems };
  const known = new Set(elicitationFormFields(request.requestedSchema).map((field) => field.name));
  const sent = Object.fromEntries(Object.entries(values).filter(([name]) => known.has(name)));
  return { result: { action: 'accept', content: contentOf(sent) } };
}
