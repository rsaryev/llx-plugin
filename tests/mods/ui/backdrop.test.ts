/**
 * The `Backdrop` render site, raised for the session's backdrop.
 * plugins/mods/reference.md § Render sites (`Backdrop`: `e.props` `id`, `plugin`, `glass`,
 * `colorScheme`; `e.requestId` `backdrop`; "`desktop` and `mobile` surfaces. Your hook runs when the
 * Desktop or mobile app asks to draw a backdrop"); plugins/mods/interface.md § Put a backdrop behind
 * the conversation (the example's hook: "This hook runs for every mod's backdrop, and another mod
 * can use the same id", so it checks `e.props.plugin` and `e.props.id`). When the app asks is the
 * host's: the kit builds the event from the backdrop `$.theme.set` set. What the mobile app draws
 * there is a judgment (tests/mods/ui/mobile.test.ts).
 */
import { expect, test } from 'bun:test';
import { backdropRender } from '../../../src/mods/ui/index.ts';
import { fn } from '../../support/mods-chain.ts';
import { recordOf, text, uiChain } from '../../support/mods-ui.ts';
import { spec } from '../../support/spec.ts';

const NIGHT_SKY = { id: 'night-sky', plugin: 'night-sky', colorScheme: 'dark' } as const;
const core = (e: unknown) => Promise.resolve({ type: 'engine', ref: e });

spec('mods.site.Backdrop', () => {
  test("the event holds the backdrop's fields as e.props and backdrop as e.requestId", () => {
    expect(backdropRender({ ...NIGHT_SKY, glass: true }, 'desktop')).toEqual({
      event: {
        component: 'Backdrop',
        surface: 'desktop',
        props: { ...NIGHT_SKY, glass: true },
        requestId: 'backdrop',
      },
    });
  });

  test('the mobile app raises the site too, and e.surface names it', () => {
    expect(backdropRender(NIGHT_SKY, 'mobile')).toEqual({
      event: { component: 'Backdrop', surface: 'mobile', props: NIGHT_SKY, requestId: 'backdrop' },
    });
  });

  test('the terminal and the VS Code extension draw no backdrop', () => {
    expect(backdropRender(NIGHT_SKY, 'terminal')).toEqual({
      problem: 'Backdrop is not raised in the terminal app',
    });
    expect('problem' in backdropRender(NIGHT_SKY, 'vscode')).toBe(true);
  });

  test("a hook draws its own backdrop and hands on another mod's", async () => {
    const h = uiChain();
    h.mod('night-sky', 'user', [
      fn('ui.render', (_$, e, next) => {
        const props = recordOf(e.props);
        if (props.plugin !== 'night-sky' || props.id !== 'night-sky') return next(e);
        return text('Night sky');
      }),
    ]);
    const fire = async (plugin: string) => {
      const built = backdropRender({ ...NIGHT_SKY, plugin }, 'desktop');
      if (!('event' in built)) throw new Error(built.problem);
      return h.fire('ui.render', built.event, { core });
    };
    expect(await fire('night-sky')).toEqual(text('Night sky'));
    expect(await fire('other')).toMatchObject({ ref: { props: { plugin: 'other' } } });
  });
});

test('with no backdrop set there is nothing to draw (judgment)', () => {
  expect(backdropRender(undefined, 'desktop')).toEqual({ problem: 'the session has no backdrop' });
});
