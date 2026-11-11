/**
 * settings-reference.md § "What else `denyInsteadOfPrompting` stops", "MCP elicitation" ("Claude
 * Code cancels an elicitation request unless an `Elicitation` hook answers it"). Asserted through
 * `autoRespondElicitation` with the session's setting.
 */
import { expect, test } from 'bun:test';
import { autoRespondElicitation } from '../../src/entry/elicitation.ts';
import { spec } from '../support/spec.ts';

const unprompted = { denyInsteadOfPrompting: true };

spec('permissions.reference.What else denyInsteadOfPrompting stops.MCP elicitation', () => {
  test('a request no Elicitation hook answers is cancelled: no dialog is shown', () => {
    expect(autoRespondElicitation(undefined, unprompted)).toEqual({ action: 'cancel' });
    expect(autoRespondElicitation({ hookEventName: 'Elicitation' }, unprompted)).toEqual({
      action: 'cancel',
    });
  });

  test("an Elicitation hook's answer still stands", () => {
    expect(
      autoRespondElicitation(
        { hookEventName: 'Elicitation', action: 'accept', content: { name: 'a' } },
        unprompted,
      ),
    ).toEqual({ action: 'accept', content: { name: 'a' } });
    expect(
      autoRespondElicitation({ hookEventName: 'Elicitation', action: 'decline' }, unprompted),
    ).toEqual({ action: 'decline' });
  });

  test('without the setting, a request no hook answers goes to the dialog', () => {
    expect(autoRespondElicitation(undefined)).toBeUndefined();
    expect(autoRespondElicitation(undefined, { denyInsteadOfPrompting: false })).toBeUndefined();
  });
});
