import type { ElicitationRequest, ElicitationResult } from '../protocol/official.ts';

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
  readonly minimum?: number;
  readonly maximum?: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const strings = (value: unknown): string[] | undefined =>
  Array.isArray(value) && value.every((each) => typeof each === 'string') ? value : undefined;

/** `enum: [...]` or `oneOf: [{ const }]`, the two ways the MCP schema lists the values of a choice. */
function optionsOf(schema: Record<string, unknown>): string[] | undefined {
  const listed = strings(schema.enum);
  if (listed !== undefined) return listed;
  const alternatives = [schema.oneOf, schema.anyOf].find(Array.isArray);
  const consts = alternatives?.flatMap((each: unknown) =>
    isRecord(each) && typeof each.const === 'string' ? [each.const] : [],
  );
  return consts !== undefined && consts.length === alternatives?.length ? consts : undefined;
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
  options: { items: string[] | undefined; choices: string[] | undefined },
): ElicitationFieldType {
  if (LIST_TYPES.has(shape.type) && options.items !== undefined) return 'multi-enum';
  if (options.choices !== undefined) return 'enum';
  const named =
    typeof shape.type === 'string' && Object.hasOwn(SCALARS, shape.type)
      ? SCALARS[shape.type]
      : undefined;
  return named ?? 'string';
}

function fieldOf(name: string, schema: unknown, required: boolean): ElicitationField {
  const shape = isRecord(schema) ? schema : {};
  const items = isRecord(shape.items) ? optionsOf(shape.items) : undefined;
  const choices = optionsOf(shape);
  const type = typeOf(shape, { items, choices });
  const options = type === 'multi-enum' ? items : type === 'enum' ? choices : undefined;
  return {
    name,
    type,
    required,
    ...(typeof shape.title === 'string' ? { title: shape.title } : {}),
    ...(typeof shape.description === 'string' ? { description: shape.description } : {}),
    ...(options === undefined ? {} : { options }),
    ...(typeof shape.minimum === 'number' ? { minimum: shape.minimum } : {}),
    ...(typeof shape.maximum === 'number' ? { maximum: shape.maximum } : {}),
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

/** One strategy per kind of field: the problem a value has, or `undefined`. Wording is the kit's. */
const CHECKS: {
  readonly [T in ElicitationFieldType]: (
    field: ElicitationField,
    value: unknown,
  ) => string | undefined;
} = {
  string: (field, value) => (typeof value === 'string' ? undefined : `${field.name} must be text`),
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
  'multi-enum': (field, value) =>
    Array.isArray(value) &&
    value.every((each) => typeof each === 'string' && field.options?.includes(each) === true)
      ? undefined
      : oneOfMessage(field),
};

type Value = string | number | boolean | string[];

/** What MCP lets a form answer hold: text, a number, a boolean or a list of text. */
const isValue = (value: unknown): value is Value =>
  ['string', 'number', 'boolean'].includes(typeof value) ||
  (Array.isArray(value) && value.every((each) => typeof each === 'string'));

export const contentOf = (values: Readonly<Record<string, unknown>>): Record<string, Value> =>
  Object.fromEntries(
    Object.entries(values).filter((entry): entry is [string, Value] => isValue(entry[1])),
  );

export type ElicitationAnswer =
  | { readonly result: ElicitationResult }
  | { readonly problems: readonly string[] };

export function formAnswer(
  request: ElicitationRequest,
  values: Readonly<Record<string, unknown>>,
): ElicitationAnswer {
  const fields = elicitationFormFields(request.requestedSchema);
  const problems = fields.flatMap((field) => {
    const value = Object.hasOwn(values, field.name) ? values[field.name] : undefined;
    if (value === undefined) return field.required ? [`${field.name} is required`] : [];
    return CHECKS[field.type](field, value) ?? [];
  });
  if (problems.length > 0) return { problems };
  const known = new Set(fields.map((field) => field.name));
  const sent = Object.fromEntries(Object.entries(values).filter(([name]) => known.has(name)));
  return { result: { action: 'accept', content: contentOf(sent) } };
}
