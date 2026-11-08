/**
 * sub-agents.md § Frontmatter reference (`memory`), § Enable persistent memory: the scope table
 * (`user` is `~/.claude/agent-memory/<name-of-agent>/`, `project` is `.claude/agent-memory/<name-of-agent>/`,
 * `local` is `.claude/agent-memory-local/<name-of-agent>/`), "if you turn auto memory off, with the
 * `autoMemoryEnabled` setting or `CLAUDE_CODE_DISABLE_AUTO_MEMORY`, the `memory` field has no effect
 * and the subagent launches without the memory instructions or the memory tool access", "the first
 * 200 lines or 25KB of `MEMORY.md` ..., whichever comes first", "Read, Write, and Edit tools are
 * automatically enabled". errors.md § Memory index is over its read limit: frontmatter and
 * block-level HTML comments do not count.
 */
import { describe, expect, test } from 'bun:test';
import { planAgentMemory, truncateMemoryIndex } from '../../src/agents/context.ts';
import { readAgent } from '../../src/format/agent.ts';
import { AGENT_MEMORY_SCOPES } from '../../src/format/agent-fields.ts';
import { file, loaded, plugin } from '../support/agent-files.ts';
import { reader } from '../support/agent-context.ts';
import { locations } from '../support/locations.ts';
import { agentWith, readWith } from '../support/launch.ts';
import { spec } from '../support/spec.ts';

const where = locations({ home: '/home/user', project: '/work/app' });
const plan = (
  scope: Parameters<typeof planAgentMemory>[0],
  files = reader(),
  agentType = 'code-reviewer',
  autoMemoryEnabled = true,
) => planAgentMemory(scope, agentType, { autoMemoryEnabled, locations: where, files });

const linesOf = (count: number): string =>
  Array.from({ length: count }, (_, i) => `- note ${i + 1}`).join('\n');
const bytesOf = (text: string): number => new TextEncoder().encode(text).length;

spec('agents.frontmatter.memory', () => {
  test('the field reads user, project and local, and nothing else', () => {
    for (const scope of AGENT_MEMORY_SCOPES) {
      expect(agentWith(`memory: ${scope}`).definition.memory).toBe(scope);
    }
    const bad = readWith('memory: global');
    expect(loaded(bad).definition.memory).toBeUndefined();
    expect(bad.issues.length).toBeGreaterThan(0);
  });

  test('a plugin agent keeps `memory` (a supported field there)', () => {
    const agent = loaded(readAgent(file('name: x\ndescription: d\nmemory: user'), plugin()));
    expect(agent.definition.memory).toBe('user');
  });

  test('each scope has its own directory under the home or project folder', async () => {
    expect((await plan('user'))?.directory).toBe('/home/user/.claude/agent-memory/code-reviewer');
    expect((await plan('project'))?.directory).toBe('/work/app/.claude/agent-memory/code-reviewer');
    expect((await plan('local'))?.directory).toBe(
      '/work/app/.claude/agent-memory-local/code-reviewer',
    );
  });

  test('Read, Write and Edit are enabled so the subagent can manage its memory files', async () => {
    expect((await plan('project'))?.addTools).toEqual(['Read', 'Write', 'Edit']);
  });

  test('without the field there is no memory and no file is read', async () => {
    const files = reader();
    expect(await plan(undefined, files)).toBeUndefined();
    expect(files.reads).toEqual([]);
  });

  test('with auto memory off the field has no effect: no instructions, no tools, no read', async () => {
    const files = reader({ '/home/user/.claude/agent-memory/code-reviewer/MEMORY.md': '- a' });
    for (const scope of AGENT_MEMORY_SCOPES) {
      expect(await plan(scope, files, 'code-reviewer', false)).toBeUndefined();
    }
    expect(files.reads).toEqual([]);
  });

  test('the system prompt gets the MEMORY.md of the directory of the scope', async () => {
    const files = reader({
      '/work/app/.claude/agent-memory/code-reviewer/MEMORY.md': '- uses bun\n',
      '/work/app/.claude/agent-memory-local/code-reviewer/MEMORY.md': '- local only\n',
    });
    expect(await plan('project', files)).toMatchObject({ index: '- uses bun\n', truncated: false });
    expect((await plan('local', files))?.index).toBe('- local only\n');
    expect((await plan('user', files))?.index).toBe('');
  });

  test('a first run has an empty index and the directory is still planned', async () => {
    expect(await plan('user')).toEqual({
      directory: '/home/user/.claude/agent-memory/code-reviewer',
      index: '',
      truncated: false,
      addTools: ['Read', 'Write', 'Edit'],
    });
  });

  test('an index of 200 lines is included whole, one more line is cut', async () => {
    expect(truncateMemoryIndex(linesOf(200))).toEqual({ text: linesOf(200), truncated: false });
    expect(truncateMemoryIndex(`${linesOf(200)}\n`).truncated).toBe(false);
    expect(truncateMemoryIndex(linesOf(201))).toEqual({ text: linesOf(200), truncated: true });
    expect(truncateMemoryIndex(linesOf(500)).text).toBe(linesOf(200));
  });

  test('an index over 25KB is cut to 25KB even within 200 lines', () => {
    const wide = Array.from({ length: 100 }, () => 'x'.repeat(400)).join('\n');
    const cut = truncateMemoryIndex(wide);
    expect(cut.truncated).toBe(true);
    expect(bytesOf(cut.text)).toBeLessThanOrEqual(25 * 1024);
    expect(wide.startsWith(cut.text)).toBe(true);
    expect(bytesOf(cut.text)).toBeGreaterThan(25 * 1000);
  });

  test('whichever limit comes first applies', () => {
    const manyShort = truncateMemoryIndex(linesOf(300));
    expect(manyShort.text.split('\n')).toHaveLength(200);
    expect(bytesOf(manyShort.text)).toBeLessThan(25 * 1024);
    const fewLong = truncateMemoryIndex(
      Array.from({ length: 150 }, () => 'y'.repeat(300)).join('\n'),
    );
    expect(fewLong.text.split('\n').length).toBeLessThan(150);
  });

  test('the planned index is the truncated one', async () => {
    const files = reader({
      '/home/user/.claude/agent-memory/code-reviewer/MEMORY.md': linesOf(260),
    });
    expect(await plan('user', files)).toMatchObject({ index: linesOf(200), truncated: true });
  });
});

describe('memory, outside spec: choices the docs leave open', () => {
  test('frontmatter and block-level comments of the index are not loaded and do not count', () => {
    const text = `---\ntitle: index\n---\n<!-- keep short -->\n${linesOf(200)}\n`;
    expect(truncateMemoryIndex(text)).toEqual({ text: `${linesOf(200)}\n`, truncated: false });
  });

  test('a comment ends at its own first `-->`: what lies between two comments survives', () => {
    const text = '<!-- a --> kept on its line\nreal note\n<!-- b -->\ntail\n';
    expect(truncateMemoryIndex(text).text).toBe('real note\ntail\n');
  });

  test('a comment inside a paragraph is not block-level and stays', () => {
    const text = 'before <!-- inline --> after\nnext\n';
    expect(truncateMemoryIndex(text)).toEqual({ text, truncated: false });
  });

  test('a multi-line comment is dropped whole, up to the line of its `-->`', () => {
    const text = 'first\n<!--\nhidden\nmore\n-->\nlast\n';
    expect(truncateMemoryIndex(text).text).toBe('first\nlast\n');
  });

  test('a comment inside a fenced code block stays', () => {
    const text = '```\n<!-- in code -->\n```\nafter\n';
    expect(truncateMemoryIndex(text)).toEqual({ text, truncated: false });
  });

  test('a comment with no `-->` is no comment and the index stays whole', () => {
    const text = '<!-- never closed\nnote\n';
    expect(truncateMemoryIndex(text)).toEqual({ text, truncated: false });
  });

  test('a plugin agent type has no `:` in its directory name', async () => {
    expect((await plan('user', reader(), 'my-plugin:review:security'))?.directory).toBe(
      '/home/user/.claude/agent-memory/my-plugin-review-security',
    );
  });

  test('a name cannot leave the memory folder', async () => {
    expect((await plan('user', reader(), '../../x'))?.directory).toBe(
      '/home/user/.claude/agent-memory/..-..-x',
    );
    expect((await plan('user', reader(), '..'))?.directory).toBe(
      '/home/user/.claude/agent-memory/-',
    );
  });

  test('25KB is 25600 bytes, cut between characters', () => {
    const text = 'é'.repeat(13_000);
    const cut = truncateMemoryIndex(text);
    expect(bytesOf(cut.text)).toBe(25_600);
    expect(truncateMemoryIndex('é'.repeat(12_800)).truncated).toBe(false);
    const odd = truncateMemoryIndex(`a${'é'.repeat(13_000)}`);
    expect(bytesOf(odd.text)).toBe(25_599);
    expect(odd.text).not.toContain('�');
  });

  test('the abort signal reaches the reader', async () => {
    const files = reader();
    const signal = new AbortController().signal;
    await planAgentMemory('user', 'x', {
      autoMemoryEnabled: true,
      locations: where,
      files,
      signal,
    });
    expect(files.reads).toEqual([{ path: '/home/user/.claude/agent-memory/x/MEMORY.md', signal }]);
  });

  test('a file path of the host is built by its own joinPath', async () => {
    const windows = {
      ...where,
      joinPath: (base: string, relative: string) => `${base}\\${relative.replaceAll('/', '\\')}`,
    };
    const files = reader();
    await planAgentMemory('local', 'x', { autoMemoryEnabled: true, locations: windows, files });
    expect(files.reads[0]?.path).toBe('/work/app\\.claude\\agent-memory-local\\x\\MEMORY.md');
  });
});
