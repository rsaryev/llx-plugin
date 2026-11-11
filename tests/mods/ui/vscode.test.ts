/**
 * interface.md § Draw in the VS Code extension: panes (docked from 800 pixels, 12 inline rows), toasts
 * and status lines (one stack, hidden behind a dialog), labels, keyboard (no hotkeys), keyboard focus,
 * the question dialog, prompt suggestions and text limits. The panel is the host's; the kit proves the
 * rules a host applies and the clipping `$.ui.status` and `$.ui.toast` do for it.
 */
import { expect, test } from 'bun:test';
import {
  VSCODE_LABELS,
  grantsFocus,
  isStatusStackVisible,
  propsReachSite,
  suggestionRefusedBy,
  vscodePanePlacement,
  uiRules,
} from '../../../src/mods/ui/index.ts';
import { hotkeyTable } from '../../../src/mods/ui/index.ts';
import { apiHarness } from '../../support/mods-api.ts';
import { fakeInterface, node, uiOver } from '../../support/mods-ui.ts';
import { spec } from '../../support/spec.ts';
import { flush } from '../../support/mods-chain.ts';
import { clipVscodeStatus, clipVscodeToast } from '../../../src/mods/ui/keyboard/vscode.ts';

const V = 'mods.interface.Draw in the VS Code extension.';

spec(`${V}Panes`, () => {
  test('a panel 800 pixels or wider docks panes; a narrower one draws them inline, 12 rows before scrolling', () => {
    expect(vscodePanePlacement(800)).toEqual({ placement: 'dock', isFullscreen: true });
    expect(vscodePanePlacement(799)).toEqual({
      placement: 'inline',
      isFullscreen: false,
      rows: 12,
    });
  });
});

spec(`${V}Toasts and status lines`, () => {
  test('the stack is hidden while a permission request or a dialog shows', () => {
    expect(isStatusStackVisible({ permissionRequest: false, dialog: false })).toBe(true);
    expect(isStatusStackVisible({ permissionRequest: true, dialog: false })).toBe(false);
    expect(isStatusStackVisible({ permissionRequest: false, dialog: true })).toBe(false);
  });
});

spec(`${V}Labels`, () => {
  test('the panel labels a drawing and a rewrite with the plugin name', () => {
    expect(VSCODE_LABELS.drawn('token-chart')).toBe('From the token-chart plugin');
    expect(VSCODE_LABELS.rewritten('token-chart')).toBe('Edited by the token-chart plugin');
  });
});

spec(`${V}Keyboard`, () => {
  test('buttons have no hotkeys', () => {
    const tree = node('Button', { key: 'a', label: 'A', hotkey: 'a' });
    const at = (surface: 'terminal' | 'vscode') =>
      hotkeyTable(tree, {
        surface,
        isBand: false,
        isCollapsed: false,
        hasFocus: true,
        isInputFocused: false,
      });
    expect(at('terminal').size).toBe(1);
    expect(at('vscode').size).toBe(0);
  });
});

spec(`${V}Keyboard focus`, () => {
  const panel = { hasFocus: true, isIdle: true, questionWaiting: false };
  const base = {
    requested: true,
    fromUserAction: false,
    surface: 'vscode',
    isPromptEmpty: true,
    otherHasFocus: false,
    panel,
  } as const;
  test('focus is granted only when the panel has focus, Claude is idle, no question waits and the prompt is empty', () => {
    expect(grantsFocus(base)).toBe(true);
    expect(grantsFocus({ ...base, panel: { ...panel, hasFocus: false } })).toBe(false);
    expect(grantsFocus({ ...base, panel: { ...panel, isIdle: false } })).toBe(false);
    expect(grantsFocus({ ...base, panel: { ...panel, questionWaiting: true } })).toBe(false);
    expect(grantsFocus({ ...base, isPromptEmpty: false })).toBe(false);
  });
});

spec(`${V}The question dialog`, () => {
  test('props passed to next do not change the question card in the panel, and do elsewhere', () => {
    expect(propsReachSite('vscode', 'AskUserQuestion')).toBe(false);
    expect(propsReachSite('terminal', 'AskUserQuestion')).toBe(true);
    expect(propsReachSite('vscode', 'Spinner')).toBe(true);
  });
});

spec(`${V}Prompt suggestions`, () => {
  test('$.prompt.suggest resolves with isShown: false in the panel', () => {
    expect(suggestionRefusedBy('vscode')).toEqual({ isShown: false });
    expect(suggestionRefusedBy('terminal')).toBeUndefined();
  });
});

spec(`${V}Text limits`, () => {
  test('a status line is cut at 200 characters or two rows and a toast at 500 characters', () => {
    expect(clipVscodeStatus('x'.repeat(250))).toHaveLength(200);
    expect(clipVscodeStatus('a\nb\nc')).toBe('a\nb');
    expect(clipVscodeToast('y'.repeat(600))).toHaveLength(500);
  });
  test('$.ui.status and $.ui.toast cut what they hand the panel and leave other apps whole', async () => {
    const long = 'z'.repeat(700);
    for (const surface of ['vscode', 'terminal'] as const) {
      const { iface, calls } = fakeInterface({ surface: () => surface });
      const h = await apiHarness({ plugin: 'my-mod', rules: uiRules, ui: uiOver(iface) });
      h.api.ui.status(long);
      await flush();
      const sent = String(calls.find((c) => c.name === 'status')?.args[0]);
      expect(sent.length).toBe(surface === 'vscode' ? 200 : long.length + '⚠ my-mod: '.length);
    }
  });
});
