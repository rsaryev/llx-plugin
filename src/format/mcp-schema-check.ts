/**
 * The check mcp.md ("Tools with invalid input schemas") names: "The schema must be valid against the
 * JSON Schema draft 2020-12 meta-schema", and "Top-level property names must be 1 to 64 characters
 * long and use only ASCII letters and digits, `_`, `.`, and `-`". The kit has no JSON Schema
 * validator, so the meta-schema is carried as a table: each keyword of its vocabularies (core,
 * applicator, unevaluated, validation, format, content, meta-data, and the deprecated `definitions` and
 * `dependencies`) with the shape its value must have. A keyword the vocabularies do not define is
 * allowed, as in the meta-schema.
 */
type Report = (path: string, message: string) => void;
type Check = (value: unknown, at: string, report: Report) => void;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const SIMPLE_TYPES = ['array', 'boolean', 'integer', 'null', 'number', 'object', 'string'];

const typed =
  (what: string, test: (value: unknown) => boolean): Check =>
  (value, at, report) => {
    if (!test(value)) report(at, `must be ${what}`);
  };

const text = typed('a string', (value) => typeof value === 'string');
const flag = typed('a boolean', (value) => typeof value === 'boolean');
const anything: Check = () => undefined;
const number = typed('a number', (value) => typeof value === 'number' && Number.isFinite(value));
const positive = typed('a number above 0', (value) => typeof value === 'number' && value > 0);
const count = typed(
  'a non-negative integer',
  (value) => typeof value === 'number' && Number.isInteger(value) && value >= 0,
);
const list = typed('an array', Array.isArray);

const unique = (items: readonly unknown[]): boolean =>
  new Set(items.map((item) => JSON.stringify(item))).size === items.length;

const stringSet: Check = (value, at, report) => {
  const fine =
    Array.isArray(value) && value.every((item) => typeof item === 'string') && unique(value);
  if (!fine) report(at, 'must be an array of unique strings');
};

const typeName: Check = (value, at, report) => {
  const names = Array.isArray(value) ? value : [value];
  const fine =
    names.length > 0 &&
    names.every((name) => typeof name === 'string' && SIMPLE_TYPES.includes(name)) &&
    unique(names);
  if (!fine) report(at, `must be one of ${SIMPLE_TYPES.join(', ')}, or a list of unique ones`);
};

/** Keywords whose value is a schema and that the table below does not list: an object literal member named `then` reads as a thenable to the linter. */
const SCHEMA_BRANCHES: ReadonlySet<string> = new Set(['then']);

const schema: Check = (value, at, report) => {
  if (typeof value === 'boolean') return;
  if (!isRecord(value)) {
    report(at, 'must be a schema (an object or a boolean)');
    return;
  }
  for (const [keyword, inner] of Object.entries(value)) {
    const check = Object.hasOwn(KEYWORDS, keyword)
      ? KEYWORDS[keyword]
      : SCHEMA_BRANCHES.has(keyword)
        ? schema
        : undefined;
    check?.(inner, `${at}/${keyword}`, report);
  }
};

const mapOf =
  (each: Check): Check =>
  (value, at, report) => {
    if (!isRecord(value)) {
      report(at, 'must be an object');
      return;
    }
    for (const [key, inner] of Object.entries(value)) each(inner, `${at}/${key}`, report);
  };

const schemas: Check = (value, at, report) => {
  if (!Array.isArray(value) || value.length === 0) {
    report(at, 'must be a non-empty array of schemas');
    return;
  }
  value.forEach((inner, index) => schema(inner, `${at}/${index}`, report));
};

const schemaOrStrings: Check = (value, at, report) =>
  Array.isArray(value) ? stringSet(value, at, report) : schema(value, at, report);

const KEYWORDS: Readonly<Record<string, Check>> = {
  // core
  $id: text,
  $schema: text,
  $ref: text,
  $anchor: text,
  $dynamicRef: text,
  $dynamicAnchor: text,
  $vocabulary: mapOf(flag),
  $comment: text,
  $defs: mapOf(schema),
  definitions: mapOf(schema),
  // applicator
  prefixItems: schemas,
  items: schema,
  contains: schema,
  additionalProperties: schema,
  properties: mapOf(schema),
  patternProperties: mapOf(schema),
  dependentSchemas: mapOf(schema),
  dependencies: mapOf(schemaOrStrings),
  propertyNames: schema,
  if: schema,
  else: schema,
  allOf: schemas,
  anyOf: schemas,
  oneOf: schemas,
  not: schema,
  // unevaluated
  unevaluatedItems: schema,
  unevaluatedProperties: schema,
  // validation
  type: typeName,
  const: anything,
  enum: list,
  multipleOf: positive,
  maximum: number,
  exclusiveMaximum: number,
  minimum: number,
  exclusiveMinimum: number,
  maxLength: count,
  minLength: count,
  pattern: text,
  maxItems: count,
  minItems: count,
  uniqueItems: flag,
  maxContains: count,
  minContains: count,
  maxProperties: count,
  minProperties: count,
  required: stringSet,
  dependentRequired: mapOf(stringSet),
  // format, content and meta-data
  format: text,
  contentEncoding: text,
  contentMediaType: text,
  contentSchema: schema,
  title: text,
  description: text,
  default: anything,
  deprecated: flag,
  readOnly: flag,
  writeOnly: flag,
  examples: list,
};

/** The places in `value` that break the draft 2020-12 meta-schema, as `path: message`. */
export function metaSchemaProblems(value: unknown): string[] {
  const found: string[] = [];
  schema(value, '', (path, message) => found.push(`${path === '' ? '(root)' : path} ${message}`));
  return found;
}

/** "1 to 64 characters long and use only ASCII letters and digits, `_`, `.`, and `-`" (the API's `^[a-zA-Z0-9_.-]{1,64}$`). */
const PROPERTY_NAME = /^[a-zA-Z0-9_.-]{1,64}$/;

const isValidPropertyName = (name: string): boolean => PROPERTY_NAME.test(name);

/** The top-level properties whose names the API would refuse. */
export function propertyNameProblems(value: unknown): string[] {
  const properties = isRecord(value) ? value.properties : undefined;
  if (!isRecord(properties)) return [];
  return Object.keys(properties)
    .filter((name) => !isValidPropertyName(name))
    .map(
      (name) =>
        `"${name}" is not a valid property name: use 1 to 64 ASCII letters, digits, _, . or -`,
    );
}

/** The dialect the meta-schema check applies to: none declared, or draft 2020-12. */
const DRAFT_2020_12 = 'https://json-schema.org/draft/2020-12/schema';

export function checksMetaSchema(value: unknown): boolean {
  const declared = isRecord(value) ? value.$schema : undefined;
  return typeof declared !== 'string' || declared.replace(/#$/, '') === DRAFT_2020_12;
}
