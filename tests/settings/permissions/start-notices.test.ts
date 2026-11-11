/**
 * permission-modes.md § "Permission modes with the HIPAA configuration" ("A terminal session also
 * shows `Auto mode isn't the default for your organization · Shift+Tab to switch`, and the VS Code
 * extension shows no notice"), § "Which mode a session starts in" (the HIPAA row of the built-in
 * defaults).
 */
import { expect, test } from 'bun:test';
import { type StartInput } from '../../../src/settings/index.ts';
import { permissionsOf, terminal } from '../../support/permissions-policy.ts';
import { spec } from '../../support/spec.ts';
import { HIPAA_AUTO_NOTICE } from '../../../src/settings/permissions/start-notices.ts';

const noticesOf = (input: StartInput): readonly string[] => {
  const started = permissionsOf([]).startingMode(input);
  return started.outcome === 'started' ? started.notices : ['refused'];
};

spec('permissions.modes.Which mode a session starts in', () => {
  test('a HIPAA terminal session shows the notice, verbatim', () => {
    expect(HIPAA_AUTO_NOTICE).toBe(
      "Auto mode isn't the default for your organization · Shift+Tab to switch",
    );
    expect(noticesOf(terminal({ hipaa: true }))).toEqual([HIPAA_AUTO_NOTICE]);
  });

  test('the VS Code extension shows no notice, nor does a start something else chose, nor another organization', () => {
    expect(noticesOf({ surface: 'vscode', autoAvailable: true, hipaa: true })).toEqual([]);
    expect(noticesOf(terminal({ hipaa: true, permissionMode: 'plan' }))).toEqual([]);
    expect(noticesOf(terminal())).toEqual([]);
  });
});
