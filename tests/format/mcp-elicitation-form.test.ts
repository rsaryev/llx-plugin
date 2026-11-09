/**
 * mcp.md § Respond to MCP elicitation requests, form mode (the fields a server defines and how an answer is
 * checked against them): what the docs leave open, asserted outside `spec(...)` (spec/judgments.md).
 */
import { describe, expect, test } from 'bun:test';
import {
  answerElicitation,
  autoRespondElicitation,
  elicitationFieldProblems,
  elicitationFormFields,
} from '../../src/entry/format.ts';
import { type ElicitationRequest } from '../../src/index.ts';

const form: ElicitationRequest = {
  serverName: 'accounts',
  message: 'Sign in to continue',
  mode: 'form',
  requestedSchema: {
    type: 'object',
    properties: {
      username: { type: 'string', title: 'Username' },
      password: { type: 'string', title: 'Password', description: 'Your password' },
      remember: { type: 'boolean' },
      retries: { type: 'integer', minimum: 0, maximum: 5 },
      region: { type: 'string', enum: ['eu', 'us'] },
    },
    required: ['username', 'password'],
  },
};

describe('what the docs leave open', () => {
  test('a schema that is no object of properties has no fields', () => {
    const schemas: readonly (Record<string, unknown> | undefined)[] = [
      undefined,
      {},
      { type: 'object' },
      { properties: [] },
      { properties: 'x' },
    ];
    for (const schema of schemas) expect(elicitationFormFields(schema)).toEqual([]);
  });

  test('field kinds: string, number, integer, boolean, enum (enum or oneOf of const) and a list of enum values', () => {
    const fields = elicitationFormFields({
      properties: {
        a: { type: 'number' },
        b: {
          type: 'string',
          oneOf: [
            { const: 'x', title: 'X' },
            { const: 'y', title: 'Y' },
          ],
        },
        c: { type: 'array', items: { type: 'string', enum: ['p', 'q'] } },
        d: { type: 'string', enumNames: ['n'] },
      },
    });
    expect(fields.map((field) => [field.name, field.type])).toEqual([
      ['a', 'number'],
      ['b', 'enum'],
      ['c', 'multi-enum'],
      ['d', 'string'],
    ]);
    expect(fields[1]?.options).toEqual(['x', 'y']);
    expect(fields[2]?.options).toEqual(['p', 'q']);
  });

  test('a value that does not fit the field is a problem, and nothing is sent', () => {
    const missing = answerElicitation(form, { action: 'accept', values: { username: 'ada' } });
    expect(missing).toEqual({ problems: ['password is required'] });
    const wrong = answerElicitation(form, {
      action: 'accept',
      values: { username: 'ada', password: 'x', retries: 9, region: 'asia', remember: 'yes' },
    });
    expect('problems' in wrong && wrong.problems).toEqual([
      'remember must be a boolean',
      'retries must be at most 5',
      'region must be one of eu, us',
    ]);
  });

  test('a list of enum values takes only those values', () => {
    const request: ElicitationRequest = {
      serverName: 's',
      message: 'm',
      mode: 'form',
      requestedSchema: { properties: { c: { type: 'array', items: { enum: ['p', 'q'] } } } },
    };
    expect(answerElicitation(request, { action: 'accept', values: { c: ['p'] } })).toEqual({
      result: { action: 'accept', content: { c: ['p'] } },
    });
    expect(
      'problems' in answerElicitation(request, { action: 'accept', values: { c: ['z'] } }),
    ).toBe(true);
  });

  test('a value for a field the schema does not define is not sent', () => {
    const answer = answerElicitation(form, {
      action: 'accept',
      values: { username: 'a', password: 'b', extra: 'x' },
    });
    expect(answer).toEqual({
      result: { action: 'accept', content: { username: 'a', password: 'b' } },
    });
  });

  test('only an acceptance carries content: a hook that declines with content sends none', () => {
    expect(
      autoRespondElicitation({
        hookEventName: 'Elicitation',
        action: 'decline',
        content: { a: 1 },
      }),
    ).toEqual({ action: 'decline' });
  });

  test('a request in no mode is form mode', () => {
    const request: ElicitationRequest = {
      serverName: 's',
      message: 'm',
      requestedSchema: { properties: {} },
    };
    expect(answerElicitation(request, { action: 'accept', values: {} })).toEqual({
      result: { action: 'accept', content: {} },
    });
  });

  test('a dialog needs the labels, the default and the format of a field', () => {
    const fields = elicitationFormFields({
      properties: {
        a: {
          type: 'string',
          oneOf: [{ const: 'x', title: 'The X' }, { const: 'y' }],
        },
        b: { type: 'string', enum: ['p', 'q'], enumNames: ['P', 'Q'] },
        c: { type: 'array', items: { anyOf: [{ const: 'm', title: 'M' }] }, default: ['m'] },
        d: { type: 'string', format: 'email', default: 'a@b.co', minLength: 3, maxLength: 9 },
        e: { type: 'string', format: 'color', default: { no: 1 } },
        f: { type: 'string', enum: ['p', 'q'], enumNames: ['only one'] },
      },
    });
    expect(fields[0]?.labels).toEqual(['The X', 'y']);
    expect(fields[1]?.labels).toEqual(['P', 'Q']);
    expect(fields[2]?.labels).toEqual(['M']);
    expect(fields[2]?.default).toEqual(['m']);
    expect(fields[3]).toMatchObject({
      format: 'email',
      default: 'a@b.co',
      minLength: 3,
      maxLength: 9,
    });
    expect(fields[4]?.format).toBeUndefined();
    expect(fields[4]?.default).toBeUndefined();
    expect(fields[5]?.labels).toEqual(['p', 'q']);
  });

  test('the problem of each field is named by field, empty when the values fit', () => {
    const schema = {
      properties: {
        mail: { type: 'string', format: 'email' },
        name: { type: 'string', minLength: 2, maxLength: 4 },
        day: { type: 'string', format: 'date' },
        at: { type: 'string', format: 'date-time' },
        site: { type: 'string', format: 'uri' },
        tags: { type: 'array', items: { enum: ['a', 'b', 'c'] }, minItems: 1, maxItems: 2 },
      },
      required: ['mail'],
    };
    expect(elicitationFieldProblems(schema, { mail: 'a@b.co' })).toEqual({});
    expect(
      elicitationFieldProblems(schema, {
        name: 'x',
        day: '2026-02-30',
        at: '2026-02-03 10:00',
        site: 'nope',
        tags: ['a', 'a'],
      }),
    ).toEqual({
      mail: 'mail is required',
      name: 'name must have at least 2 characters',
      day: 'day must be a date (YYYY-MM-DD)',
      at: 'at must be a date and time (ISO 8601)',
      site: 'site must be a full URL',
      tags: 'tags must choose each option once',
    });
    const fits = {
      mail: 'a@b.co',
      name: 'abcd',
      day: '2028-02-29',
      at: '2026-02-03T10:00:00Z',
      site: 'https://x.test',
      tags: ['a', 'c'],
    };
    expect(elicitationFieldProblems(schema, fits)).toEqual({});
    expect(elicitationFieldProblems(schema, { ...fits, name: 'abcde' }).name).toBe(
      'name must have at most 4 characters',
    );
    expect(elicitationFieldProblems(schema, { ...fits, mail: 'x' }).mail).toBe(
      'mail must be an email address',
    );
    expect(elicitationFieldProblems(schema, { ...fits, tags: [] }).tags).toBe(
      'tags must choose at least 1',
    );
    expect(elicitationFieldProblems(schema, { ...fits, tags: ['a', 'b', 'c'] }).tags).toBe(
      'tags must choose at most 2',
    );
  });
});
