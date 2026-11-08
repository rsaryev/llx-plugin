/**
 * The render sites.
 * plugins/mods/reference.md § Render sites (each site's `e.props`, `e.requestId` and the apps that
 * raise it; `e.viewport`); plugins/mods/interface.md § Change what Claude Code already draws.
 * When Claude Code raises a site is the host's: the kit proves the table it holds equals the
 * reference's, which apps raise each site, and that a hook receives the documented fields. Rows
 * that describe their props in words ("The reply's text", "The tool's name, input, and result")
 * name no field, so for those sites the test proves the component, the app and the request id only
 * (spec/judgments.md). What is proven is the table (a transcription check against the docs), which
 * apps raise each site, which sites carry a request id, and that a hook can rewrite `e.props`
 * through `next`. The props themselves are the host's: the kit does not model that `UserMessage`
 * carries `task` or `from` by origin, nor the fields of the `Pane` `view` and `scroll` props.
 */
import { expect, test } from 'bun:test';
import {
  RENDER_SITE_NAMES,
  RENDER_SITES,
  SURFACES,
  type RenderSite,
} from '../../../src/protocol/mods-ui-names.ts';
import { decideSite, renderEvent } from '../../../src/mods/ui/index.ts';
import { fn } from '../../support/mods-chain.ts';
import { MODS_REFERENCE } from '../../support/mods-reference.ts';
import { recordOf, uiChain } from '../../support/mods-ui.ts';
import { spec } from '../../support/spec.ts';

type Row = (typeof MODS_REFERENCE.renderSites)[number];

const PROSE_SITES: Partial<Record<RenderSite, string>> = {
  AskUserQuestion: 'mods.interface.Change what Claude Code already draws.AskUserQuestion',
  AssistantMessage: 'mods.interface.Change what Claude Code already draws.AssistantMessage',
  CommandOutput: 'mods.interface.Change what Claude Code already draws.CommandOutput',
  InfoNotice: 'mods.interface.Change what Claude Code already draws.InfoNotice',
  PromptHint: 'mods.interface.Change what Claude Code already draws.PromptHint',
  SessionMode: 'mods.interface.Change what Claude Code already draws.SessionMode',
  Spinner: 'mods.interface.Change what Claude Code already draws.Spinner',
  ToolGroup: 'mods.interface.Change what Claude Code already draws.ToolGroup',
  ToolProgress: 'mods.interface.Change what Claude Code already draws.ToolProgress',
  ToolResult: 'mods.interface.Change what Claude Code already draws.ToolResult',
  ToolUse: 'mods.interface.Change what Claude Code already draws.ToolUse',
  TurnDuration: 'mods.interface.Change what Claude Code already draws.TurnDuration',
  UserMessage: 'mods.interface.Change what Claude Code already draws.UserMessage',
};

const rows = (): readonly Row[] => MODS_REFERENCE.renderSites;

const siteRow = (site: RenderSite): Row => {
  const row = rows().find((candidate) => candidate.sites.includes(site));
  if (!row) throw new Error(`no row for ${site}`);
  return row;
};

test('the sites the kit holds are the sites of the reference table, 15 in all', () => {
  expect(rows().flatMap((row) => row.sites)).toEqual([...RENDER_SITE_NAMES]);
  expect(RENDER_SITE_NAMES).toHaveLength(15);
});

for (const site of RENDER_SITE_NAMES) {
  const prose = PROSE_SITES[site];
  spec([`mods.site.${site}`, ...(prose ? [prose] : [])], () => {
    test('the table holds the site as the reference does: its props, its request id and the apps that raise it', () => {
      const row = siteRow(site);
      expect<readonly string[]>([...RENDER_SITES[site].props]).toEqual(row.props);
      expect<string | undefined>(RENDER_SITES[site].request).toBe(row.request ?? undefined);
      expect<readonly string[]>([...RENDER_SITES[site].surfaces]).toEqual(row.surfaces);
    });

    test('the site is raised in the apps the table names and not in the others', () => {
      for (const surface of SURFACES) {
        const raised = RENDER_SITES[site].surfaces.includes(surface);
        expect(decideSite(site, surface)).toBe(raised);
        const built = renderEvent({
          site,
          surface,
          requestId: 'id-1',
          viewport: { columns: 80, rows: 24, isFullscreen: true },
        });
        expect('event' in built).toBe(raised);
      }
    });

    test('a hook receives the component, the app and the request id, and what it passes to next as e.props reaches Claude Code`s drawing', async () => {
      const surface = RENDER_SITES[site].surfaces[0] ?? 'terminal';
      const built = renderEvent({
        site,
        surface,
        props: { marker: 'host' },
        requestId: 'id-1',
        viewport: { columns: 80, rows: 24, isFullscreen: true },
      });
      if (!('event' in built)) throw new Error(built.problem);
      const seen: unknown[] = [];
      const h = uiChain();
      h.mod('my-mod', 'user', [
        fn(
          'ui.render',
          (_$, e, next) => (
            seen.push(e),
            next({ ...e, props: { ...recordOf(e.props), marker: 'hook' } })
          ),
        ),
      ]);
      const settled = await h.fire('ui.render', built.event, {
        core: (e) => Promise.resolve({ type: 'engine', ref: e }),
      });
      expect(seen).toMatchObject([{ component: site, surface }]);
      expect(settled).toMatchObject({ ref: { component: site, props: { marker: 'hook' } } });
      const wantsId = RENDER_SITES[site].request !== 'instance';
      expect(seen).toMatchObject(wantsId ? [{ requestId: 'id-1' }] : [{}]);
      expect(wantsId || !('requestId' in built.event)).toBe(true);
    });
  });
}

spec('mods.site.Pane', () => {
  test('a pane request needs the pane id, the id its hook checks (e.requestId)', () => {
    expect(renderEvent({ site: 'Pane', surface: 'terminal' })).toEqual({
      problem: 'Pane needs a requestId',
    });
  });
});

test('e.viewport is absent until the terminal or the Desktop app measured its window, and always present in the VS Code extension', () => {
  const measured = { columns: 100, rows: 30, isFullscreen: false };
  for (const surface of ['terminal', 'desktop'] as const) {
    const before = renderEvent({ site: 'AbovePrompt', surface });
    expect(before).toMatchObject({ event: { component: 'AbovePrompt' } });
    expect('event' in before && 'viewport' in before.event).toBe(false);
    const after = renderEvent({ site: 'AbovePrompt', surface, viewport: measured });
    expect(after).toMatchObject({ event: { viewport: measured } });
  }
  expect(renderEvent({ site: 'Pane', surface: 'vscode', requestId: 'p' })).toEqual({
    problem: 'the VS Code extension always has a viewport',
  });
  expect(
    renderEvent({ site: 'Pane', surface: 'vscode', requestId: 'p', viewport: measured }),
  ).toMatchObject({
    event: { viewport: measured },
  });
});
