/**
 * hooks.md, the "<Event> input" section of PostModelSwitch (the fields of PreModelSwitch, two more
 * `source` values) and SubagentStop (the subagent's own `agent_id` and `agent_type`, its transcript
 * apart from the main one): the documented JSON is what the kit builds and a bad field is refused.
 */
import { expect, test } from 'bun:test';
import { builtFromExample, builtInput } from '../../support/hooks-doc-input.ts';
import { spec } from '../../support/spec.ts';

const TRANSCRIPT = '/Users/me/.claude/projects/p/00893aaf-19fa-41d2-8238-13269b9b3ca0.jsonl';
const head = { session_id: 'abc123', transcript_path: TRANSCRIPT, cwd: '/Users/me' };

spec('hooks.behavior.PostModelSwitch input', () => {
  const fields = {
    from_model: 'claude-sonnet-5',
    to_model: 'claude-opus-5',
    requested_model: 'opus',
    source: 'command',
    context_tokens: 182340,
    prompt_cache_warm: true,
    cache_ttl: '5m',
    estimated_cache_write_usd: 1.1396,
    pricing: 'catalog',
  };
  const example = { ...head, hook_event_name: 'PostModelSwitch', ...fields };

  test('the fields of PreModelSwitch, with hook_event_name PostModelSwitch', () => {
    expect(builtFromExample('PostModelSwitch', example).wire).toEqual(example);
    const pre = builtFromExample('PreModelSwitch', {
      ...example,
      hook_event_name: 'PreModelSwitch',
    });
    expect(pre.wire).toEqual({ ...example, hook_event_name: 'PreModelSwitch' });
  });

  test.each(['command', 'picker', 'sdk'])('the source %s is one of the two events', (source) => {
    expect(builtInput('PreModelSwitch', { ...fields, source }).wire?.['source']).toBe(source);
    expect(builtInput('PostModelSwitch', { ...fields, source }).wire?.['source']).toBe(source);
  });

  test.each(['5m', '1h'])('cache_ttl %s arrives', (cacheTtl) => {
    expect(builtInput('PostModelSwitch', { ...fields, cache_ttl: cacheTtl }).wire).toMatchObject({
      cache_ttl: cacheTtl,
    });
    expect(builtInput('PreModelSwitch', { ...fields, cache_ttl: cacheTtl }).wire).toMatchObject({
      cache_ttl: cacheTtl,
    });
  });

  test.each(['configured', 'catalog', 'default'])('pricing %s arrives', (pricing) => {
    expect(builtInput('PostModelSwitch', { ...fields, pricing }).wire?.['pricing']).toBe(pricing);
    expect(builtInput('PreModelSwitch', { ...fields, pricing }).wire?.['pricing']).toBe(pricing);
  });

  test('requested_model is null when the request was for the default model, even for a command', () => {
    const { wire } = builtInput('PreModelSwitch', {
      ...fields,
      source: 'command',
      requested_model: null,
    });
    expect(wire?.['requested_model']).toBeNull();
  });

  test('two more source values: auto and resume', () => {
    for (const source of ['auto', 'resume']) {
      expect(builtInput('PostModelSwitch', { ...fields, source }).wire?.['source']).toBe(source);
      // PreModelSwitch is not run for them
      expect(builtInput('PreModelSwitch', { ...fields, source }).errors).toEqual([
        'hooks.PreModelSwitch.input.source',
      ]);
    }
  });

  test('requested_model is null for an automatic change, and the saved setting for a resume', () => {
    const auto = builtInput('PostModelSwitch', {
      ...fields,
      source: 'auto',
      requested_model: null,
    });
    expect(auto.wire?.['requested_model']).toBeNull();
    const resume = builtInput('PostModelSwitch', {
      ...fields,
      source: 'resume',
      requested_model: 'opusplan',
    });
    expect(resume.wire?.['requested_model']).toBe('opusplan');
  });

  test.each([
    ['cache_ttl', '30m'],
    ['pricing', 'free'],
    ['prompt_cache_warm', 'yes'],
    ['context_tokens', 'many'],
  ])('a bad %s is refused', (field, bad) => {
    expect(builtInput('PostModelSwitch', { ...fields, [field]: bad }).errors).toEqual([
      `hooks.PostModelSwitch.input.${field}`,
    ]);
  });
});

spec('hooks.behavior.SubagentStop input', () => {
  const example = {
    session_id: 'abc123',
    transcript_path: '~/.claude/projects/p/abc123.jsonl',
    cwd: '/Users/me',
    permission_mode: 'default',
    hook_event_name: 'SubagentStop',
    stop_hook_active: false,
    agent_id: 'def456',
    agent_type: 'Explore',
    agent_transcript_path: '~/.claude/projects/p/abc123/subagents/agent-def456.jsonl',
    last_assistant_message: 'Analysis complete. Found 3 potential issues...',
    background_tasks: [],
    session_crons: [],
  };

  test('the documented example, with the transcript of the main session and of the subagent apart', () => {
    const { wire } = builtFromExample('SubagentStop', example);
    expect(wire).toEqual(example);
    expect(wire?.['transcript_path']).not.toBe(wire?.['agent_transcript_path']);
  });

  test('the subagent own agent_id and agent_type win over the session ones', () => {
    const { wire } = builtInput(
      'SubagentStop',
      {
        stop_hook_active: false,
        agent_id: 'def456',
        agent_type: 'Explore',
        agent_transcript_path: '/a.jsonl',
      },
      { agent: { id: 'outer', type: 'security-reviewer' } },
    );
    expect(wire?.['agent_id']).toBe('def456');
    expect(wire?.['agent_type']).toBe('Explore');
  });

  test('an internal agent reports the session agent name, or an empty agent_type without one', () => {
    const facts = { stop_hook_active: false, agent_id: 'a', agent_transcript_path: '/a.jsonl' };
    expect(builtInput('SubagentStop', { ...facts, agent_type: '' }).wire?.['agent_type']).toBe('');
    expect(
      builtInput('SubagentStop', { ...facts, agent_type: 'reviewer' }).wire?.['agent_type'],
    ).toBe('reviewer');
  });

  test('last_assistant_message, background_tasks and session_crons are optional', () => {
    const { wire } = builtInput('SubagentStop', {
      stop_hook_active: true,
      agent_id: 'a',
      agent_type: 'Explore',
      agent_transcript_path: '/a.jsonl',
    });
    expect(wire).not.toHaveProperty('last_assistant_message');
    expect(wire).not.toHaveProperty('background_tasks');
    expect(wire).not.toHaveProperty('session_crons');
  });

  test.each(['stop_hook_active', 'agent_id', 'agent_type', 'agent_transcript_path'])(
    'without %s there is no input',
    (field) => {
      const facts: Record<string, unknown> = {
        stop_hook_active: false,
        agent_id: 'a',
        agent_type: 'Explore',
        agent_transcript_path: '/a.jsonl',
      };
      delete facts[field];
      expect(builtInput('SubagentStop', facts).errors).toEqual([
        `hooks.SubagentStop.input.${field}`,
      ]);
    },
  );
});
