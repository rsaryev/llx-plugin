/**
 * interface.md § Redraw a site ("When Claude Code redraws without being asked", "Redraw when your data
 * changes", "Redraw on a timer"), § Pick where to draw, gallery.md § See where a mod can draw;
 * troubleshoot.md § A `ui.render` line says `threw while drawn`, `$.ui.open` runs and no pane appears,
 * A drawing works in the terminal and not in the Desktop app or VS Code.
 */
import { expect, test } from 'bun:test';
import {
  decideSite,
  drawFaultLine,
  redrawsUnasked,
  renderEvent,
  withUiRules,
} from '../../../src/mods/ui/index.ts';
import { RENDER_SITES } from '../../../src/protocol/mods-ui-names.ts';
import { apiHarness } from '../../support/mods-api.ts';
import { fakeInterface, uiOver } from '../../support/mods-ui.ts';
import { spec } from '../../support/spec.ts';

spec('mods.interface.When Claude Code redraws without being asked', () => {
  test('a changed prop or width redraws; a timer or a changed module variable does not', () => {
    expect(redrawsUnasked('props')).toBe(true);
    expect(redrawsUnasked('width')).toBe(true);
    expect(redrawsUnasked('clientFault')).toBe(true);
    expect(redrawsUnasked('timer')).toBe(false);
    expect(redrawsUnasked('moduleVariable')).toBe(false);
  });
});

spec('mods.interface.Redraw on a timer', () => {
  test('$.clock.every with $.ui.invalidate asks the host for a redraw on each tick', async () => {
    const { iface, calls } = fakeInterface();
    const h = await apiHarness({ rules: withUiRules, ui: uiOver(iface) });
    const timer = h.api.clock.every(1000, () => h.api.ui.invalidate('ui.render'));
    expect(typeof timer).toBe('object');
    h.clock.advance(1000);
    await Promise.resolve();
    expect(calls.filter((c) => c.name === 'redraw').length).toBeGreaterThan(0);
  });
});

spec('mods.interface.Pick where to draw', () => {
  test('a hook can draw in the Pane (by its id) or the AbovePrompt band, and the other sites Claude Code draws', () => {
    expect(RENDER_SITES.Pane.request).toBe('pane-id');
    expect(RENDER_SITES.AbovePrompt.request).toBe('instance');
    for (const site of ['Spinner', 'UserMessage', 'ToolUse', 'AskUserQuestion'] as const) {
      expect(decideSite(site, 'terminal')).toBe(true);
    }
    expect(renderEvent({ site: 'Pane', surface: 'terminal' })).toEqual({
      problem: 'Pane needs a requestId',
    });
  });
});

spec(
  [
    'mods.gallery.See where a mod can draw',
    'mods.gallery.See where a mod can draw.Pane and band',
    'mods.gallery.See where a mod can draw.Question dialog',
    'mods.gallery.See where a mod can draw.Toast, status line, and log line',
  ],
  () => {
    test('the places the gallery names exist: pane and band, Claude Code rows, toast, status, log, question dialog', async () => {
      for (const site of ['Pane', 'AbovePrompt', 'Spinner', 'AskUserQuestion'] as const) {
        expect(decideSite(site, 'terminal')).toBe(true);
      }
      const { iface } = fakeInterface();
      const h = await apiHarness({ rules: withUiRules, ui: uiOver(iface) });
      for (const method of ['toast', 'status', 'log', 'ask'] as const) {
        expect(typeof h.api.ui[method]).toBe('function');
      }
    });
  },
);

spec('mods.troubleshoot.A ui.render line says threw while drawn', () => {
  test('the line names the mod, the site and the error, and ends with the engine drawing its own', () => {
    expect(drawFaultLine('first-mod', 'ToolUse', 'boom')).toBe(
      'first-mod: ui.render (ToolUse) threw while drawn: boom; the engine drew its own',
    );
  });
});

spec('mods.troubleshoot.$.ui.open runs and no pane appears', () => {
  test('a pane the mod opens by itself in a narrow terminal waits: isPlaced is false with a reason', async () => {
    const { iface } = fakeInterface({
      origin: () => 'mod',
      viewport: () => ({ columns: 100, rows: 40, isFullscreen: true }),
    });
    const h = await apiHarness({ rules: withUiRules, ui: uiOver(iface) });
    expect(await h.api.ui.open({ id: 'p' })).toMatchObject({ isPlaced: false });
  });
});

spec(
  'mods.troubleshoot.A drawing works in the terminal and not in the Desktop app or VS Code',
  () => {
    test('a site or element the app does not draw is not raised or not drawn there', () => {
      expect(decideSite('PromptHint', 'vscode')).toBe(
        RENDER_SITES.PromptHint.surfaces.includes('vscode'),
      );
      const problem = renderEvent({
        site: 'InfoNotice',
        surface: 'vscode',
        viewport: { columns: 80, rows: 24, isFullscreen: false },
      });
      expect('problem' in problem || 'event' in problem).toBe(true);
      expect(RENDER_SITES.Pane.surfaces).toEqual(['terminal', 'desktop', 'vscode']);
    });
  },
);
