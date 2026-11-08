/**
 * settings-reference.md § `workflowKeywordTriggerEnabled` (Scope "Any file"; `true`: typing
 * `ultracode` in a prompt triggers a dynamic workflow; `false`: "you can type the word without
 * triggering one"; Default `true`; "The `ultracode` effort setting, `/workflows`, and saved workflow
 * commands are unaffected"), workflows.md § Ask for a workflow in your prompt ("include the keyword
 * `ultracode` in your prompt"; "Claude Code highlights the keyword in your input"), § Dismiss or turn
 * off the keyword (dismiss the highlight for this prompt), § Where the keyword works ("an opt-in only
 * in a prompt you type yourself: at the interactive prompt, in an IDE extension panel, in a Remote
 * Control client, or in an Agent SDK application that stamps your keyboard input's `origin` as
 * `{ kind: "human" }`"; no trigger for a prompt passed with `-p`, an SDK prompt not stamped as human
 * input, a scheduled task prompt, a webhook payload or pull request comment relayed into the
 * conversation), § Turn workflows off ("The `ultracode` keyword no longer triggers a run").
 */
import { describe, expect, test } from 'bun:test';
import {
  keywordTrigger,
  PROMPT_SURFACES,
  type PromptInput,
  workflowsDecision,
  type WorkflowsContext,
} from '../../../src/settings/workflows/index.ts';
import { viewOf } from '../../support/plugin-settings.ts';
import { issuesOf, plain } from '../../support/settings-layers.ts';
import { spec } from '../../support/spec.ts';

const team: WorkflowsContext = { env: {}, plan: { pro: false } };
const typed = (text: string): PromptInput => ({ surface: 'interactive', text });
const setting = (value: unknown) => ({ workflowKeywordTriggerEnabled: value });
const triggers = (text: string) => keywordTrigger(viewOf(), team, typed(text)).triggers;
const at = (surface: PromptInput['surface'], origin?: PromptInput['origin']): PromptInput => ({
  surface,
  text: audit,
  ...(origin === undefined ? {} : { origin }),
});
const audit = 'ultracode: audit every API endpoint under src/routes/ for missing auth checks';

spec('settings.key.workflowKeywordTriggerEnabled', () => {
  test('unset: typing the keyword triggers a workflow and the keyword is highlighted', () => {
    const verdict = keywordTrigger(viewOf(), team, typed(audit));
    expect(verdict.triggers).toBe(true);
    expect(plain(verdict.highlight)).toEqual({ start: 0, end: 'ultracode'.length });
  });

  test('true triggers, false lets you type the word without triggering one', () => {
    expect(keywordTrigger(viewOf(['user', setting(true)]), team, typed(audit)).triggers).toBe(true);
    const off = keywordTrigger(viewOf(['user', setting(false)]), team, typed(audit));
    expect(off.triggers).toBe(false);
    expect(off.highlight).toBeUndefined();
    expect(off.reason).toBe('keywordSettingOff');
  });

  test('any file sets it; the highest file that sets it wins', () => {
    for (const scope of ['user', 'project', 'local', 'flag', 'managed'] as const) {
      expect(keywordTrigger(viewOf([scope, setting(false)]), team, typed(audit)).triggers).toBe(
        false,
      );
    }
    const view = viewOf(['local', setting(true)], ['user', setting(false)]);
    expect(keywordTrigger(view, team, typed(audit)).triggers).toBe(true);
  });

  test('a prompt without the keyword triggers nothing', () => {
    const verdict = keywordTrigger(viewOf(), team, typed('audit every API endpoint'));
    expect(verdict).toMatchObject({ triggers: false, reason: 'noKeyword' });
  });

  test('a value that is not a Boolean is dropped with a warning, so the default applies', () => {
    const raw = setting('false');
    expect(issuesOf('user', raw).length).toBeGreaterThan(0);
    expect(keywordTrigger(viewOf(['user', raw]), team, typed(audit)).triggers).toBe(true);
  });

  test('the key leaves workflows themselves alone: the other ways to start one stay available', () => {
    const decision = workflowsDecision(viewOf(['user', setting(false)]), team);
    expect(decision.enabled).toBe(true);
    expect(decision.surfaces.workflowsView).toBe(true);
    expect(decision.surfaces.workflowCommands).toBe(true);
    expect(decision.surfaces.ultracodeToggle).toBe(true);
  });

  test('the keyword no longer triggers a run when workflows are turned off', () => {
    const off = viewOf(['managed', { disableWorkflows: true }]);
    const verdict = keywordTrigger(off, team, typed(audit));
    expect(verdict).toMatchObject({ triggers: false, reason: 'workflowsOff' });
    expect(workflowsDecision(off, team).surfaces.keyword).toBe(false);
  });
});

spec('settings.key.workflowKeywordTriggerEnabled', () => {
  test('it triggers in a prompt you type: the interactive prompt, an IDE panel, a Remote Control client', () => {
    for (const surface of ['interactive', 'ideExtension', 'remoteControl'] as const) {
      expect(keywordTrigger(viewOf(), team, at(surface)).triggers).toBe(true);
    }
  });

  test('it triggers in an SDK application only when the prompt is stamped as human input', () => {
    expect(keywordTrigger(viewOf(), team, at('sdk', { kind: 'human' })).triggers).toBe(true);
  });

  test('it does not trigger for an SDK prompt that is not stamped as human input', () => {
    const unstamped = keywordTrigger(viewOf(), team, at('sdk'));
    expect(unstamped).toMatchObject({ triggers: false, reason: 'notTypedByHuman' });
    const others = [
      { kind: 'channel', server: 'chat' },
      { kind: 'peer', from: 'other-session' },
      { kind: 'task-notification' },
    ] as const;
    for (const origin of others) {
      expect(keywordTrigger(viewOf(), team, at('sdk', origin)).triggers).toBe(false);
    }
  });

  test('it does not trigger for -p, a scheduled task or a relayed webhook or pull request comment', () => {
    for (const surface of ['print', 'scheduledTask', 'relayedEvent'] as const) {
      expect(keywordTrigger(viewOf(), team, at(surface))).toMatchObject({
        triggers: false,
        reason: 'notTypedByHuman',
      });
    }
  });

  test('every surface the kit knows is decided', () => {
    for (const surface of PROMPT_SURFACES) {
      expect(typeof keywordTrigger(viewOf(), team, at(surface)).triggers).toBe('boolean');
    }
  });

  test('a human origin stamped on a surface that is not an SDK prompt changes nothing', () => {
    expect(keywordTrigger(viewOf(), team, at('print', { kind: 'human' })).triggers).toBe(false);
  });

  test('the highlight dismissed for this prompt (Option+W, Alt+W, backspace) stops the trigger', () => {
    const verdict = keywordTrigger(viewOf(), team, { ...typed(audit), dismissed: true });
    expect(verdict).toMatchObject({ triggers: false, reason: 'dismissed' });
  });
});

describe('what the docs leave open (spec/judgments.md)', () => {
  test('the keyword is a whole word, found anywhere in the prompt, in any letter case', () => {
    expect(triggers('please ultracode this refactor')).toBe(true);
    expect(triggers('Ultracode: audit the routes')).toBe(true);
    expect(triggers('use ULTRACODE here')).toBe(true);
    expect(triggers('ultracoded')).toBe(false);
    expect(triggers('myultracode')).toBe(false);
  });

  test('the highlight is the first occurrence', () => {
    const verdict = keywordTrigger(viewOf(), team, typed('fix it, ultracode it, ultracode it'));
    expect(plain(verdict.highlight)).toEqual({ start: 8, end: 17 });
  });

  test('a slash command is not a prompt: /effort ultracode does not trigger a run', () => {
    expect(triggers('/effort ultracode')).toBe(false);
    expect(triggers('  /effort ultracode')).toBe(false);
  });

  test('the reasons are checked in the order workflows, surface, dismissal, setting, keyword', () => {
    const off = viewOf(['managed', { disableWorkflows: true }], ['user', setting(false)]);
    const input: PromptInput = { surface: 'print', text: 'no keyword', dismissed: true };
    expect(keywordTrigger(off, team, input).reason).toBe('workflowsOff');
    expect(keywordTrigger(viewOf(['user', setting(false)]), team, input).reason).toBe(
      'notTypedByHuman',
    );
  });
});
