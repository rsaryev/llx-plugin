/**
 * tools-reference.md § Agent tool behavior: "Foreground subagents show the same permission prompts you
 * would see in the main conversation, at the moment each tool call happens"; "Background subagents
 * surface permission prompts in your main session. The prompt names which subagent is asking, and
 * pressing Esc denies that one tool call without stopping the subagent." Teammate and fork launches.
 */
import { expect, test } from 'bun:test';
import { runsInBackground } from '../../src/agents/launch.ts';
import { namedSubagent } from '../../src/agents/catalog/spawn.ts';
import { permissionSubagentPromptSurface } from '../../src/agents/prompt-surface.ts';
import { spec } from '../support/spec.ts';

spec('tools.behavior.Agent tool behavior.Foreground subagents', () => {
  test('a foreground subagent prompts at the call, as the main conversation does', () => {
    expect(permissionSubagentPromptSurface(false).appearsIn).toBe('call');
  });
  test('a subagent Claude waits for runs in the foreground', () => {
    expect(runsInBackground({ claudeWillWait: true })).toBe(false);
  });
});

spec('tools.behavior.Agent tool behavior.Background subagents', () => {
  test('a background subagent surfaces prompts in the main session, naming itself', () => {
    expect(permissionSubagentPromptSurface(true)).toEqual({
      appearsIn: 'main-session',
      namesSubagent: true,
      escDeniesOneCall: true,
    });
  });
  test('subagents run in the background by default', () => {
    expect(runsInBackground({ claudeWillWait: false })).toBe(true);
  });
});

spec('tools.behavior.Agent tool behavior.Teammate', () => {
  test('with agent teams, a call with a name launches a teammate, not a plain subagent', () => {
    const base = {
      agentTeams: true,
      interactive: true,
      fork: false,
      isolationOnCall: false,
      fromMainConversation: true,
    };
    expect(namedSubagent({ ...base, name: 'reviewer' }).launchesAs).toBe('teammate');
    expect(namedSubagent({ ...base, name: undefined }).launchesAs).toBe('subagent');
    expect(namedSubagent({ ...base, agentTeams: false, name: 'reviewer' }).launchesAs).toBe(
      'subagent',
    );
  });
});
