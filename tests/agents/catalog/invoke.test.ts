/**
 * sub-agents.md, "Invoke subagents explicitly": a name in a natural-language prompt (Claude decides),
 * an @-mention (`@"code-reviewer (agent)"` from the picker, `@agent-<name>` typed, scoped for plugin
 * agents; the full message still goes to Claude) and the whole session as a subagent (`--agent`, the
 * `agent` setting, the flag over the setting, a plugin agent by its bare or scoped name, the warning
 * for an agent that is gone on resume, from errors.md "Session agent no longer available").
 */
import { describe, expect, test } from 'bun:test';
import { builtinAgents } from '../../../src/agents/catalog/builtin.ts';
import {
  agentMentions,
  agentTypeahead,
  resumeSessionAgent,
  selectSessionAgent,
  sessionAgentLabel,
} from '../../../src/agents/catalog/invoke.ts';
import { resolveAgents } from '../../../src/agents/catalog/resolve.ts';
import { parsed } from '../../support/rule-context.ts';
import { spec } from '../../support/spec.ts';
import { pluginAgent, scannedAgent } from '../../support/agent-catalog.ts';

const catalog = resolveAgents({
  builtin: builtinAgents({ interactive: true, disableExplorePlan: false, disableAll: false }),
  scanned: [scannedAgent('project', 'code-reviewer'), scannedAgent('user', 'test-runner')],
  plugin: [
    pluginAgent('my-plugin', 'code-reviewer'),
    pluginAgent('my-plugin', 'security', 'review/security.md'),
    pluginAgent('other-plugin', 'security-reviewer'),
  ],
});

const mentioned = (text: string, from = catalog) =>
  agentMentions(text, from).mentions.map((mention) => mention.agent.name);

spec('agents.behavior.Invoke subagents explicitly.Natural language', () => {
  test('naming the subagent in a prompt has no special syntax: nothing is forced, Claude decides', () => {
    for (const prompt of [
      'Use the test-runner subagent to fix failing tests',
      'Have the code-reviewer subagent look at my recent changes',
    ]) {
      const found = agentMentions(prompt, catalog);
      expect(found.mentions).toEqual([]);
      expect(found.message).toBe(prompt);
    }
  });
});

spec('agents.behavior.Invoke subagents explicitly.@-mention', () => {
  test('a mention picked from the typeahead, @"name (agent)", guarantees that subagent', () => {
    const found = agentMentions('@"code-reviewer (agent)" look at the auth changes', catalog);
    expect(found.mentions.map((mention) => mention.agent.name)).toEqual(['code-reviewer']);
    expect(found.mentions[0]?.agent.source).toBe('project');
  });

  test('the full message still goes to Claude: a mention picks the subagent, not the prompt', () => {
    const text = '@"code-reviewer (agent)" look at the auth changes';
    expect(agentMentions(text, catalog).message).toBe(text);
  });

  test('a mention typed by hand, @agent-<name>, resolves for a local subagent', () => {
    expect(mentioned('@agent-test-runner fix the failing tests')).toEqual(['test-runner']);
  });

  test('a plugin subagent is mentioned by its scoped name, subfolders included', () => {
    expect(mentioned('@agent-my-plugin:code-reviewer check this')).toEqual([
      'my-plugin:code-reviewer',
    ]);
    expect(mentioned('@agent-my-plugin:review:security audit it')).toEqual([
      'my-plugin:review:security',
    ]);
    expect(mentioned('@"my-plugin:review:security (agent)" audit it')).toEqual([
      'my-plugin:review:security',
    ]);
  });

  test('punctuation after a typed mention is not part of the name', () => {
    expect(mentioned('ask @agent-test-runner, then stop')).toEqual(['test-runner']);
    expect(mentioned('(@agent-test-runner)')).toEqual(['test-runner']);
  });

  test('a mention of a name that is no subagent, or of a file, selects nothing', () => {
    expect(mentioned('@agent-ghost do it')).toEqual([]);
    expect(mentioned('@"ghost (agent)" do it')).toEqual([]);
    expect(mentioned('read @src/code-reviewer.md')).toEqual([]);
    expect(mentioned('mail me@agent-test-runner.example')).toEqual([]);
  });

  test('a subagent mentioned twice is selected once, and two different ones are both selected, in order', () => {
    expect(mentioned('@agent-test-runner and @agent-test-runner')).toEqual(['test-runner']);
    expect(mentioned('@agent-test-runner then @"code-reviewer (agent)"')).toEqual([
      'test-runner',
      'code-reviewer',
    ]);
  });

  test('the typeahead lists every subagent as "name (agent)", plugin ones under their scoped name', () => {
    const labels = agentTypeahead(catalog).map((entry) => entry.label);
    expect(labels).toContain('code-reviewer (agent)');
    expect(labels).toContain('my-plugin:code-reviewer (agent)');
    expect(labels).toContain('my-plugin:review:security (agent)');
    expect(labels).toContain('Explore (agent)');
    const picked = agentTypeahead(catalog).find((entry) => entry.label === 'test-runner (agent)');
    expect(picked?.insert).toBe('@"test-runner (agent)"');
    expect(agentMentions(picked?.insert ?? '', catalog).mentions).toHaveLength(1);
  });
});

describe('the whole session as a subagent', () => {
  spec('agents.behavior.Invoke subagents explicitly.Session-wide', () => {
    test('--agent <name> runs the session as that subagent and the header shows @<name>', () => {
      const chosen = selectSessionAgent(catalog, { flag: 'code-reviewer' });
      expect(chosen.ok && chosen.agent?.name).toBe('code-reviewer');
      expect(chosen.ok && chosen.from).toBe('flag');
      expect(chosen.ok && chosen.agent && sessionAgentLabel(chosen.agent)).toBe('@code-reviewer');
    });

    test('the agent setting does the same; the flag overrides it when both are present', () => {
      const setting = selectSessionAgent(catalog, { setting: 'test-runner' });
      expect(setting.ok && [setting.agent?.name, setting.from]).toEqual(['test-runner', 'setting']);
      const both = selectSessionAgent(catalog, { flag: 'code-reviewer', setting: 'test-runner' });
      expect(both.ok && [both.agent?.name, both.from]).toEqual(['code-reviewer', 'flag']);
    });

    test('no flag and no setting leaves the session as it is', () => {
      expect(selectSessionAgent(catalog, {})).toEqual({ ok: true, agent: undefined });
    });

    test('it works with built-in subagents too', () => {
      const chosen = selectSessionAgent(catalog, { flag: 'Explore' });
      expect(chosen.ok && chosen.agent?.source).toBe('builtin');
    });

    test('for a plugin subagent the bare name finds it', () => {
      const chosen = selectSessionAgent(catalog, { flag: 'security' });
      expect(chosen.ok && chosen.agent?.name).toBe('my-plugin:review:security');
    });

    test('a bare name that two plugins provide is ambiguous: pass the scoped name', () => {
      const twins = resolveAgents({
        plugin: [
          pluginAgent('a-plugin', 'security-reviewer'),
          pluginAgent('b-plugin', 'security-reviewer'),
        ],
      });
      const bare = selectSessionAgent(twins, { flag: 'security-reviewer' });
      expect(bare.ok).toBe(false);
      expect(!bare.ok && bare.message).toBe(
        'Agent "security-reviewer" is provided by several plugins; pass the scoped name: a-plugin:security-reviewer, b-plugin:security-reviewer',
      );
      const scoped = selectSessionAgent(twins, { flag: 'a-plugin:security-reviewer' });
      expect(scoped.ok && scoped.agent?.name).toBe('a-plugin:security-reviewer');
    });

    test('a subfolder of the plugin agents/ directory is part of the scoped name', () => {
      const chosen = selectSessionAgent(catalog, { flag: 'my-plugin:review:security' });
      expect(chosen.ok && chosen.agent?.ownName).toBe('security');
    });

    test('a bare name is the file or flag agent before a plugin one: plugins have the lowest priority', () => {
      const chosen = selectSessionAgent(catalog, { flag: 'code-reviewer' });
      expect(chosen.ok && chosen.agent?.source).toBe('project');
    });

    test('a name no subagent has is refused, naming it', () => {
      const chosen = selectSessionAgent(catalog, { flag: 'ghost' });
      expect(chosen.ok).toBe(false);
      expect(!chosen.ok && chosen.message).toBe('No subagent named "ghost"');
    });

    test('an agent a deny rule stops Claude from delegating to can still be the session agent', () => {
      const denied = resolveAgents({
        builtin: builtinAgents({ interactive: true, disableExplorePlan: false, disableAll: false }),
        denied: [parsed('Agent(Explore)')],
      });
      const chosen = selectSessionAgent(denied, { flag: 'Explore' });
      expect(chosen.ok && chosen.agent?.name).toBe('Explore');
    });

    test('on resume the choice is restored; if the agent is gone the session goes on with a warning that names it', () => {
      const restored = resumeSessionAgent(catalog, 'test-runner', ['/home/you/project']);
      expect(restored.agent?.name).toBe('test-runner');
      expect(restored.warning).toBeUndefined();
      const gone = resumeSessionAgent(catalog, 'ghost', ['/home/you/project']);
      expect(gone.agent).toBeUndefined();
      expect(gone.warning).toBe(
        "This session was running agent 'ghost', which is no longer available (no agent by that name in /home/you/project). Continuing with the default tools and system prompt — the agent's tool restrictions no longer apply. To restore it, re-create the agent, or resume with an explicit --agent <name>.",
      );
    });

    test('the warning names only the directories searched, and the built-in claude agent never triggers it', () => {
      const several = resumeSessionAgent(catalog, 'ghost', ['/work/a', '/work/b']);
      expect(several.warning).toContain('(no agent by that name in /work/a, /work/b)');
      const empty = resolveAgents({});
      expect(resumeSessionAgent(empty, 'claude', ['/work/a']).warning).toBeUndefined();
    });
  });
});

describe('judgments of the @-mention (spec/judgments.md)', () => {
  test('a subagent a deny rule switched off is not offered in the typeahead and cannot be mentioned', () => {
    const denied = resolveAgents({
      scanned: [scannedAgent('user', 'test-runner')],
      denied: [parsed('Agent(test-runner)')],
    });
    expect(agentTypeahead(denied)).toEqual([]);
    expect(mentioned('@agent-test-runner go', denied)).toEqual([]);
  });
});
