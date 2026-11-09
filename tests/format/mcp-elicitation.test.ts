/**
 * mcp.md § Respond to MCP elicitation requests (form mode: fields the server defines; URL mode: a link
 * opened after asking; the URL passed as a command-line argument with a cap on its escaped length,
 * where each escaped character counts four times; the `Elicitation` hook answers without a dialog) and
 * § Elicitation modes Claude Code declares (`elicitation: {form: {}, url: {}}` on protocol revision
 * 2026-07-28 and on the user's own stdio, sse, http and ws servers on earlier revisions; the bare
 * `elicitation: {}`, form mode only, elsewhere); hooks.md § Elicitation and § ElicitationResult (the
 * hook fields come from the official types). The set of characters that need escaping, the form
 * validation and the wording of problems are judgments (spec/judgments.md), asserted outside `spec(...)`.
 */
import { expect, test } from 'bun:test';
import {
  answerElicitation,
  autoRespondElicitation,
  declaredElicitation,
  elicitationFormFields,
  elicitationHookFacts,
  elicitationModes,
  elicitationUrlChoices,
  ELICITATION_URL_ARGUMENT_CAP,
  overrideElicitationResult,
  type ElicitationRequest,
} from '../../src/index.ts';
import { spec } from '../support/spec.ts';

const BOTH = { form: {}, url: {} };

spec('mcp.behavior.Elicitation modes Claude Code declares', () => {
  test('on protocol revision 2026-07-28 both modes are declared, on every kind of connection', () => {
    for (const userConfigured of [true, false]) {
      expect(declaredElicitation({ protocolRevision: '2026-07-28', userConfigured })).toEqual(BOTH);
    }
    expect(declaredElicitation({ protocolRevision: '2027-01-01', userConfigured: false })).toEqual(
      BOTH,
    );
  });

  test('on the earlier revisions, 2025-11-25 and older, both modes are declared for the servers of a user MCP configuration', () => {
    for (const protocolRevision of ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']) {
      expect(declaredElicitation({ protocolRevision, userConfigured: true })).toEqual(BOTH);
    }
  });

  test('on its other connections on the earlier revisions, such as claude.ai connectors, it declares the bare elicitation: {}', () => {
    for (const protocolRevision of ['2025-11-25', '2024-11-05']) {
      expect(declaredElicitation({ protocolRevision, userConfigured: false })).toEqual({});
    }
  });

  test('the bare declaration permits form mode only; the full one permits both', () => {
    expect(elicitationModes({})).toEqual(['form']);
    expect(elicitationModes(BOTH)).toEqual(['form', 'url']);
    expect(elicitationModes({ form: {} })).toEqual(['form']);
    expect(elicitationModes({ url: {} })).toEqual(['url']);
  });
});

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

spec('mcp.behavior.Respond to MCP elicitation requests', () => {
  test('form mode: the dialog has the fields the server defines, with the required ones marked', () => {
    const fields = elicitationFormFields(form.requestedSchema);
    expect(fields.map((field) => [field.name, field.type, field.required])).toEqual([
      ['username', 'string', true],
      ['password', 'string', true],
      ['remember', 'boolean', false],
      ['retries', 'integer', false],
      ['region', 'enum', false],
    ]);
    expect(fields[0]?.title).toBe('Username');
    expect(fields[1]?.description).toBe('Your password');
    expect(fields[4]?.options).toEqual(['eu', 'us']);
  });

  test('"Fill in the fields and submit": the answer carries the action and the content', () => {
    const answer = answerElicitation(form, {
      action: 'accept',
      values: { username: 'ada', password: 'x', remember: true, retries: 3, region: 'eu' },
    });
    expect(answer).toEqual({
      result: {
        action: 'accept',
        content: { username: 'ada', password: 'x', remember: true, retries: 3, region: 'eu' },
      },
    });
  });

  test('declining or cancelling sends no content', () => {
    expect(answerElicitation(form, { action: 'decline' })).toEqual({
      result: { action: 'decline' },
    });
    expect(answerElicitation(form, { action: 'cancel' })).toEqual({ result: { action: 'cancel' } });
  });

  const link: ElicitationRequest = {
    serverName: 'accounts',
    message: 'Finish signing in',
    mode: 'url',
    url: 'https://accounts.example.com/signin?x=1',
    elicitationId: 'e-1',
  };

  test('URL mode asks whether to open a link: accept opens it, and no content is sent back', () => {
    expect(elicitationUrlChoices(link.url ?? '')).toEqual(['open', 'decline']);
    expect(answerElicitation(link, { action: 'accept', values: {} })).toEqual({
      result: { action: 'accept' },
    });
  });

  test('the URL passed to the system handler has a cap on its escaped length: 8,000 characters with nothing to escape', () => {
    expect(ELICITATION_URL_ARGUMENT_CAP).toBe(8_000);
    const plain = (length: number) =>
      `https://x.test/${'a'.repeat(length - 'https://x.test/'.length)}`;
    expect(elicitationUrlChoices(plain(8_000))).toEqual(['open', 'decline']);
    expect(elicitationUrlChoices(plain(8_001))).toEqual(['decline']);
  });

  test('every character that needs escaping, such as % or &, counts four times: its own and three escape characters', () => {
    const base = 'https://x.test/';
    // 3,000 escaped characters count 12,000 and the rest of the URL its length: 8,000 is the cap.
    const urlWith = (escaped: number, plain: number) =>
      `${base}${'%'.repeat(escaped)}${'a'.repeat(plain)}`;
    const used = (escaped: number, plain: number) => base.length + escaped * 4 + plain;
    const at = urlWith(1_000, 8_000 - used(1_000, 0));
    expect(elicitationUrlChoices(at)).toEqual(['open', 'decline']);
    expect(elicitationUrlChoices(`${at}a`)).toEqual(['decline']);
    expect(elicitationUrlChoices(`${base}${'&'.repeat(2_000)}`)).toEqual(['decline']);
    expect(elicitationUrlChoices(`${base}${'&'.repeat(1_996)}`)).toEqual(['open', 'decline']);
  });

  test('a URL where every third character is % reaches the cap at roughly 4,000 characters', () => {
    const third = (length: number) => 'aa%'.repeat(Math.ceil(length / 3)).slice(0, length);
    expect(elicitationUrlChoices(third(3_990))).toEqual(['open', 'decline']);
    expect(elicitationUrlChoices(third(4_020))).toEqual(['decline']);
  });

  test('the Elicitation hook answers without showing a dialog; an output with no action leaves the dialog', () => {
    expect(
      autoRespondElicitation({ hookEventName: 'Elicitation', action: 'accept', content: { a: 1 } }),
    ).toEqual({ action: 'accept', content: { a: 1 } });
    expect(autoRespondElicitation({ hookEventName: 'Elicitation', action: 'decline' })).toEqual({
      action: 'decline',
    });
    expect(autoRespondElicitation({ hookEventName: 'Elicitation' })).toBeUndefined();
    expect(autoRespondElicitation(undefined)).toBeUndefined();
  });

  test('the hook receives the request in the official field names', () => {
    expect(elicitationHookFacts(form)).toEqual({
      mcp_server_name: 'accounts',
      message: 'Sign in to continue',
      mode: 'form',
      requested_schema: form.requestedSchema ?? {},
    });
    expect(
      elicitationHookFacts({
        serverName: 's',
        message: 'm',
        mode: 'url',
        url: 'https://u.test',
        elicitationId: 'i',
      }),
    ).toEqual({
      mcp_server_name: 's',
      message: 'm',
      mode: 'url',
      url: 'https://u.test',
      elicitation_id: 'i',
    });
  });

  test('the ElicitationResult hook may override the action or the content before the answer is sent', () => {
    const answer = { action: 'accept', content: { a: 'user' } } as const;
    expect(
      overrideElicitationResult(answer, {
        hookEventName: 'ElicitationResult',
        content: { a: 'hook' },
      }),
    ).toEqual({
      action: 'accept',
      content: { a: 'hook' },
    });
    expect(
      overrideElicitationResult(answer, { hookEventName: 'ElicitationResult', action: 'decline' }),
    ).toEqual({
      action: 'decline',
    });
    expect(overrideElicitationResult(answer, { hookEventName: 'ElicitationResult' })).toEqual(
      answer,
    );
  });
});

spec('hooks.output.ElicitationResult.Cancel the request', () => {
  test('cancel goes to the server along with the values the user submitted; decline withholds them; an Elicitation hook cancel sends none', () => {
    const answer = { action: 'accept', content: { a: 'user' } } as const;
    expect(
      overrideElicitationResult(answer, { hookEventName: 'ElicitationResult', action: 'cancel' }),
    ).toEqual({ action: 'cancel', content: { a: 'user' } });
    expect(
      overrideElicitationResult(answer, { hookEventName: 'ElicitationResult', action: 'decline' }),
    ).toEqual({ action: 'decline' });
    expect(
      autoRespondElicitation({ hookEventName: 'Elicitation', action: 'cancel', content: { a: 1 } }),
    ).toEqual({ action: 'cancel' });
  });
});
