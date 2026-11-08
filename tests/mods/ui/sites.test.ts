/**
 * The render sites.
 * plugins/mods/reference.md § Render sites (each site's `e.props`, `e.requestId` and the apps that
 * raise it; `e.viewport`); plugins/mods/interface.md § Change what Claude Code already draws.
 * When Claude Code raises a site is the host's: the kit proves the table it holds equals the
 * reference's, which apps raise each site, and that a hook receives the documented fields. Rows
 * that describe their props in words ("The reply's text", "The tool's name, input, and result")
 * name no field, so for those sites the test proves the component, the app and the request id only
 * (spec/judgments.md).
 */
import { expect, test } from 'bun:test';
import {
  RENDER_SITE_NAMES,
  RENDER_SITES,
  SURFACES,
  type RenderSite,
  type Surface,
} from '../../../src/protocol/mods-ui-names.ts';
import { decideSite, renderEvent } from '../../../src/mods/ui/index.ts';
import { fn } from '../../support/mods-chain.ts';
import { codeTokens, sectionsOf, tableRows } from '../../support/mods-docs.ts';
import { uiChain } from '../../support/mods-ui.ts';
import { spec } from '../../support/spec.ts';

const SURFACE_WORDS: Readonly<Record<string, Surface>> = {
  Terminal: 'terminal',
  Desktop: 'desktop',
  'VS Code': 'vscode',
};
const REQUESTS = [
  ["The pane's", 'pane-id'],
  ['One instance', 'instance'],
  ['The message id', 'message-id'],
  ['The tool call id', 'tool-call-id'],
  ['The agent id', 'agent-id'],
] as const;

interface Row {
  readonly sites: readonly string[];
  readonly props: readonly string[];
  readonly request: string | undefined;
  readonly surfaces: readonly Surface[];
}

const rows = (): readonly Row[] =>
  tableRows(sectionsOf(2).find((s) => s.heading === 'Render sites')?.lines ?? [], 'Site').map(
    (cells) => ({
      sites: codeTokens(cells[0] ?? ''),
      props: codeTokens(cells[1] ?? ''),
      request: REQUESTS.find(([start]) => (cells[2] ?? '').startsWith(start))?.[1],
      surfaces: Object.entries(SURFACE_WORDS)
        .filter(([word]) => (cells[3] ?? '').includes(word))
        .map(([, surface]) => surface),
    }),
  );

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
  spec(`mods.site.${site}`, () => {
    test('the table holds the site as the reference does: its props, its request id and the apps that raise it', () => {
      const row = siteRow(site);
      expect<readonly string[]>([...RENDER_SITES[site].props]).toEqual(row.props);
      expect<string | undefined>(RENDER_SITES[site].request).toBe(row.request);
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

    test('a hook receives the documented fields: component, app, request id and the props the table names', async () => {
      const surface = RENDER_SITES[site].surfaces[0] ?? 'terminal';
      const props = Object.fromEntries(RENDER_SITES[site].props.map((name) => [name, `v-${name}`]));
      const built = renderEvent({
        site,
        surface,
        props,
        requestId: 'id-1',
        viewport: { columns: 80, rows: 24, isFullscreen: true },
      });
      if (!('event' in built)) throw new Error(built.problem);
      const seen: unknown[] = [];
      const h = uiChain();
      h.mod('my-mod', 'user', [fn('ui.render', (_$, e, next) => (seen.push(e), next(e)))]);
      await h.fire('ui.render', built.event);
      const [event] = seen;
      expect(event).toMatchObject({ component: site, surface, props });
      const wantsId = RENDER_SITES[site].request !== 'instance';
      expect(event).toMatchObject(wantsId ? { requestId: 'id-1' } : {});
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
