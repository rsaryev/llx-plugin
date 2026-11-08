/**
 * sub-agents.md § Permission modes (which value a subagent runs in, given the main conversation's
 * mode; the table of values) and permission-modes.md § Available modes (what each mode runs
 * without asking). The kit owns two things per mode: the resolution of the subagent's mode, and
 * the baseline decision of the table. What a host renders ("prompts", "auto-denies") and the
 * classifier's judgment are the host's: not in scope here.
 */
import { describe, expect, test } from 'bun:test';
import {
  PERMISSION_MODE_INPUTS,
  type PermissionModeInput,
} from '../../src/agents/permission-mode.ts';
import { DOC_INPUTS, resolve, row } from '../support/permission-modes.ts';
import type { PermissionMode } from '../../src/protocol/official.ts';
import { spec } from '../support/spec.ts';

/** The subagent resolves to `mode` for every value it could set, and for none. */
const heldWhatever = (main: Parameters<typeof resolve>[0], mode: Parameters<typeof resolve>[0]) => {
  for (const set of [undefined, ...DOC_INPUTS]) {
    expect(resolve(main, set).mode).toBe(mode);
  }
};

spec('agents.permissionMode.default', () => {
  test('Manual mode reads only: everything else prompts, in scope or not', () => {
    expect(row('default')).toEqual(['allow', 'ask', 'ask', 'ask']);
    expect(row('default', false)).toEqual(['allow', 'ask', 'ask', 'ask']);
  });

  test('"default" and its alias "manual" run in Manual mode when the main conversation lets them', () => {
    for (const main of ['default', 'dontAsk'] as const) {
      for (const set of ['default', 'manual'] as const) {
        expect(resolve(main, set)).toEqual({
          mode: 'default',
          denyInsteadOfAsk: false,
          basis: 'set',
        });
      }
    }
  });

  test('unset, the subagent inherits the main conversation mode', () => {
    expect(resolve('default')).toEqual({
      mode: 'default',
      denyInsteadOfAsk: false,
      basis: 'inherited',
    });
  });

  test('it does not override a main conversation in acceptEdits, auto, bypassPermissions or plan', () => {
    for (const main of ['acceptEdits', 'auto', 'bypassPermissions', 'plan'] as const) {
      expect(resolve(main, 'default')).toMatchObject({ mode: main, basis: 'main' });
    }
  });
});

spec('agents.permissionMode.acceptEdits', () => {
  test('reads, file edits and common filesystem commands run without asking inside the working directories', () => {
    expect(row('acceptEdits')).toEqual(['allow', 'allow', 'allow', 'ask']);
  });

  test('paths outside that scope still prompt', () => {
    expect(row('acceptEdits', false)).toEqual(['allow', 'ask', 'ask', 'ask']);
  });

  test('a subagent that sets it runs in it when the main conversation is default or dontAsk', () => {
    for (const main of ['default', 'dontAsk'] as const) {
      expect(resolve(main, 'acceptEdits')).toMatchObject({ mode: 'acceptEdits', basis: 'set' });
    }
  });

  test('a main conversation in acceptEdits makes every subagent run in it, whatever it sets', () => {
    heldWhatever('acceptEdits', 'acceptEdits');
    expect(resolve('acceptEdits', 'plan').basis).toBe('main');
    expect(resolve('acceptEdits').basis).toBe('inherited');
  });
});

spec('agents.permissionMode.auto', () => {
  // The classifier is a model call the host makes (spec/judgments.md): the kit proves who runs
  // under it and what is routed to it.
  test('reads and in-scope edits skip the classifier; everything else goes to it', () => {
    expect(row('auto')).toEqual(['allow', 'allow', 'classify', 'classify']);
    expect(row('auto', false)).toEqual(['allow', 'classify', 'classify', 'classify']);
  });

  test('a main conversation in auto makes the subagent run in auto and ignores what it sets', () => {
    heldWhatever('auto', 'auto');
    expect(resolve('auto', 'default').basis).toBe('main');
  });

  test('set to auto under a default or dontAsk main conversation, it runs in auto only when auto mode is available', () => {
    for (const main of ['default', 'dontAsk'] as const) {
      expect(resolve(main, 'auto', true)).toMatchObject({ mode: 'auto', basis: 'set' });
      expect(resolve(main, 'auto', false)).toMatchObject({ mode: main, basis: 'main' });
    }
  });

  test('a main conversation in plan keeps the subagent in plan even when it sets auto', () => {
    expect(resolve('plan', 'auto')).toMatchObject({ mode: 'plan', basis: 'main' });
  });
});

spec('agents.permissionMode.dontAsk', () => {
  test('only reads inside the working directories run; anything that would prompt is denied', () => {
    expect(row('dontAsk')).toEqual(['allow', 'deny', 'deny', 'deny']);
    expect(row('dontAsk', false)).toEqual(['deny', 'deny', 'deny', 'deny']);
  });

  test('a subagent that sets it under a default main conversation runs in it and denies', () => {
    expect(resolve('default', 'dontAsk')).toEqual({
      mode: 'dontAsk',
      denyInsteadOfAsk: true,
      basis: 'set',
    });
  });

  test('under a plan main conversation it stays in plan, and an action plan would ask about is denied', () => {
    expect(resolve('plan', 'dontAsk')).toEqual({
      mode: 'plan',
      denyInsteadOfAsk: true,
      basis: 'main',
    });
    for (const set of ['default', 'manual', 'acceptEdits', 'auto', 'plan'] as const) {
      expect(resolve('plan', set).denyInsteadOfAsk).toBe(false);
    }
  });

  test('a main conversation in dontAsk is inherited and denies; its subagent may set another mode', () => {
    expect(resolve('dontAsk')).toEqual({
      mode: 'dontAsk',
      denyInsteadOfAsk: true,
      basis: 'inherited',
    });
    expect(resolve('dontAsk', 'default')).toMatchObject({
      mode: 'default',
      denyInsteadOfAsk: false,
    });
  });

  test('under bypassPermissions, acceptEdits or auto the setting is ignored and nothing is denied', () => {
    for (const main of ['bypassPermissions', 'acceptEdits', 'auto'] as const) {
      expect(resolve(main, 'dontAsk')).toMatchObject({ mode: main, denyInsteadOfAsk: false });
    }
  });
});

spec('agents.permissionMode.bypassPermissions', () => {
  test('every action runs without asking', () => {
    expect(row('bypassPermissions')).toEqual(['allow', 'allow', 'allow', 'allow']);
    expect(row('bypassPermissions', false)).toEqual(['allow', 'allow', 'allow', 'allow']);
  });

  test('a subagent runs in it only when the main conversation does', () => {
    heldWhatever('bypassPermissions', 'bypassPermissions');
    for (const main of ['default', 'dontAsk', 'acceptEdits', 'auto', 'plan'] as const) {
      expect(resolve(main, 'bypassPermissions').mode).toBe(main);
    }
  });

  test('under a default or dontAsk main conversation it keeps the main mode, as the exception says', () => {
    expect(resolve('default', 'bypassPermissions')).toEqual({
      mode: 'default',
      denyInsteadOfAsk: false,
      basis: 'main',
    });
    expect(resolve('dontAsk', 'bypassPermissions')).toMatchObject({
      mode: 'dontAsk',
      denyInsteadOfAsk: true,
      basis: 'main',
    });
  });
});

spec('agents.permissionMode.plan', () => {
  test('reads run; the baseline asks for the rest (the classifier-approved commands are not modelled)', () => {
    expect(row('plan')).toEqual(['allow', 'ask', 'ask', 'ask']);
  });

  test('a main conversation in plan keeps the subagent in plan whichever mode it sets', () => {
    heldWhatever('plan', 'plan');
    expect(resolve('plan', 'bypassPermissions').basis).toBe('main');
  });

  test('a subagent that sets plan runs in it under a default or dontAsk main conversation', () => {
    for (const main of ['default', 'dontAsk'] as const) {
      expect(resolve(main, 'plan')).toEqual({
        mode: 'plan',
        denyInsteadOfAsk: false,
        basis: 'set',
      });
    }
  });

  test('under acceptEdits, auto or bypassPermissions the setting is ignored', () => {
    for (const main of ['acceptEdits', 'auto', 'bypassPermissions'] as const) {
      expect(resolve(main, 'plan').mode).toBe(main);
    }
  });
});

describe('the resolution matrix of sub-agents.md, cell by cell', () => {
  // Rows: the main conversation default or dontAsk; columns: the value the subagent sets.
  const SET_APPLIES: readonly (readonly [PermissionModeInput, PermissionMode])[] = [
    ['default', 'default'],
    ['manual', 'default'],
    ['acceptEdits', 'acceptEdits'],
    ['dontAsk', 'dontAsk'],
    ['plan', 'plan'],
  ];

  test.each(['default', 'dontAsk'] as const)('main %s: a set mode applies', (main) => {
    for (const [set, expected] of SET_APPLIES) {
      expect(resolve(main, set).mode).toBe(expected);
    }
  });

  test('the inputs are the six modes and manual', () => {
    expect([...PERMISSION_MODE_INPUTS].toSorted()).toEqual([...DOC_INPUTS].toSorted());
  });
});
