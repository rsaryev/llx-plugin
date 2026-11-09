/**
 * The metadata-first catalog (spec/judgments.md, "metadata-first catalog"): a scan keeps a skill's
 * frontmatter and a `BodyReader`, never the body; the body is read through the same port when the
 * skill runs, so a body edited since the scan is what runs (skills.md, "Edit a skill during a
 * session" is the documented side of it). Judgments, outside `spec()`.
 */
import { describe, expect, test } from 'bun:test';
import {
  resolveFolderSkills,
  scanFolders,
  scanNested,
  scanSkillContainer,
} from '../../../src/skills/index.ts';
import { signal, standardPlugins } from '../../support/host.ts';
import { refusing } from '../../support/refusing-folders.ts';
import { HOME, PROJECT, folderHostOf, portOf, requestOf, skillText } from '../../support/scan.ts';

const skillFile = (root: string, name: string) => `${root}/.claude/skills/${name}/SKILL.md`;
const MARKER = 'BODY-MARKER-1f3a';

describe('a scan keeps no body', () => {
  const files = {
    [skillFile(PROJECT, 'deploy')]: skillText('Deploy', `# ${MARKER}`),
    [`${PROJECT}/.claude/commands/lint.md`]: skillText('Lint', `# ${MARKER}`),
  };

  test('an entry holds the frontmatter and no body, for a skill and for a command file', async () => {
    const outcome = await scanFolders({ folders: portOf(files), request: requestOf({}) });
    expect(outcome.entries.map((entry) => entry.invocable.command).toSorted()).toEqual([
      'deploy',
      'lint',
    ]);
    for (const entry of outcome.entries) {
      expect('body' in entry.invocable).toBe(false);
      expect(JSON.stringify(entry.invocable)).not.toContain('Do the');
    }
    expect(outcome.entries.map((entry) => entry.invocable.description)).toEqual(['Deploy', 'Lint']);
  });

  test('readBody gives the body, and the resolution keeps the reader', async () => {
    const outcome = await scanFolders({ folders: portOf(files), request: requestOf({}) });
    const resolution = resolveFolderSkills(outcome.entries, { cwd: PROJECT });
    const bodies = await Promise.all(resolution.resolved.map((each) => each.readBody()));
    expect(bodies.every((body) => body?.includes('Do the'))).toBe(true);
  });

  test('a nested scan keeps no body either', async () => {
    const nested = { [skillFile(`${PROJECT}/web`, 'ui')]: skillText('UI') };
    const scenario = { disk: { repositories: [PROJECT] } };
    const context = { folders: portOf(nested, scenario), request: requestOf(scenario) };
    const found = await scanNested(context, `${PROJECT}/web/page.ts`);
    expect(found.entries).toHaveLength(1);
    expect('body' in (found.entries[0]?.invocable ?? {})).toBe(false);
    expect(await found.entries[0]?.readBody()).toContain('Do the UI work');
  });
});

describe('readBody is fresh and never memoized', () => {
  test('an edited body is what it returns, while the metadata stays as scanned', async () => {
    const files: Record<string, string> = { [skillFile(PROJECT, 'deploy')]: skillText('Deploy') };
    const outcome = await scanFolders({ folders: portOf(files), request: requestOf({}) });
    const [entry] = outcome.entries;
    expect(await entry?.readBody()).toContain('Do the Deploy work.');
    files[skillFile(PROJECT, 'deploy')] = skillText('Changed');
    expect(await entry?.readBody()).toContain('Do the Changed work.');
    expect(entry?.invocable.description).toBe('Deploy');
  });

  test('a file that is gone reads as undefined, for a skill and for a command file', async () => {
    const files: Record<string, string> = {
      [skillFile(PROJECT, 'deploy')]: skillText('Deploy'),
      [`${PROJECT}/.claude/commands/lint.md`]: skillText('Lint'),
    };
    const outcome = await scanFolders({ folders: portOf(files), request: requestOf({}) });
    delete files[skillFile(PROJECT, 'deploy')];
    delete files[`${PROJECT}/.claude/commands/lint.md`];
    expect(await Promise.all(outcome.entries.map((entry) => entry.readBody()))).toEqual([
      undefined,
      undefined,
    ]);
  });

  test('a skill whose file now has a reserved name (Claude Code does not load it) reads as undefined', async () => {
    const path = skillFile(PROJECT, 'deploy');
    const files: Record<string, string> = { [path]: skillText('Deploy') };
    const outcome = await scanFolders({ folders: portOf(files), request: requestOf({}) });
    files[path] = ['---', 'name: anthropic-skills:deploy', '---', 'body'].join('\n');
    expect(await outcome.entries[0]?.readBody()).toBeUndefined();
  });
});

describe('a port that refuses a file', () => {
  const files = {
    [skillFile(HOME, 'big')]: skillText('Big'),
    [skillFile(HOME, 'small')]: skillText('Small'),
    [`${HOME}/.claude/commands/huge.md`]: skillText('Huge'),
  };

  test('skips that file with a warning that carries the port message, and lists the rest', async () => {
    const folders = refusing(
      refusing(portOf(files), 'big/SKILL.md', 'file is 2 MiB'),
      'huge.md',
      'too large',
    );
    const outcome = await scanFolders({ folders, request: requestOf({}) });
    expect(outcome.entries.map((entry) => entry.invocable.command)).toEqual(['small']);
    const messages = outcome.issues.map((issue) => `${issue.severity}: ${issue.message}`);
    expect(messages.some((text) => text.includes('file is 2 MiB'))).toBe(true);
    expect(messages.some((text) => text.includes('too large'))).toBe(true);
    expect(outcome.issues.every((issue) => issue.severity === 'warning')).toBe(true);
  });

  test('a refusal when the body is read rejects with the port error', async () => {
    let refuse = false;
    const folders = refusing(portOf(files), 'small/SKILL.md', 'changed during read', () => refuse);
    const outcome = await scanFolders({ folders, request: requestOf({}) });
    const small = outcome.entries.find((entry) => entry.invocable.command === 'small');
    expect(await small?.readBody()).toContain('Do the Small work.');
    refuse = true;
    const failure = await small?.readBody().then(
      () => undefined,
      (cause: unknown) => cause,
    );
    expect(failure instanceof Error && failure.message).toBe('changed during read');
  });

  test('an aborted scan still rejects instead of becoming a warning', async () => {
    const abort = new AbortController();
    const folders = refusing(portOf(files), 'small/SKILL.md', 'aborted');
    abort.abort();
    const failure = await scanFolders({
      folders,
      request: requestOf({}),
      signal: abort.signal,
    }).then(
      () => undefined,
      (cause: unknown) => cause,
    );
    expect(failure instanceof Error && failure.message).toBe('aborted');
  });
});

describe('a session reads the body when the skill runs', () => {
  test('an edit since the last reload is what runs; a refused or missing file fails the expansion', async () => {
    const files: Record<string, string> = { [skillFile(PROJECT, 'ship')]: skillText('Ship') };
    const { session } = folderHostOf(files, { plugins: await standardPlugins() });
    await session.reloadSkills({ signal: signal() });
    const first = await session.expandSkill('ship', { signal: signal() });
    expect(first.ok && first.text).toContain('Do the Ship work.');
    files[skillFile(PROJECT, 'ship')] = skillText('Ship', 'allowed-tools: Read').replace(
      'Do the Ship work.',
      'Edited text.',
    );
    const second = await session.expandSkill('ship', { signal: signal() });
    expect(second.ok && second.text).toContain('Edited text.');
    delete files[skillFile(PROJECT, 'ship')];
    const gone = await session.expandSkill('ship', { signal: signal() });
    expect(gone.ok).toBe(false);
  });
});

describe('scanSkillContainer', () => {
  const origin = { kind: 'project' } as const;
  const request = { scope: 'project', origin, rootName: 'pack' } as const;

  test('reads the skill folders of any container, with no body', async () => {
    const files = {
      '/store/skills/a/SKILL.md': skillText('A'),
      '/store/skills/b/SKILL.md': skillText('B'),
      '/store/skills/notes/readme.md': 'no skill here',
    };
    const found = await scanSkillContainer(portOf(files), '/store', 'skills', request);
    expect(found.entries.map((entry) => entry.invocable.name).toSorted()).toEqual(['a', 'b']);
    expect(found.entries.every((entry) => !('body' in entry.invocable))).toBe(true);
    expect(await found.entries[0]?.readBody()).toContain('Do the A work.');
  });

  test('a container that holds SKILL.md is one skill, named by the caller unless the file names it', async () => {
    const files = {
      '/plugin/SKILL.md': skillText('Root'),
      '/plugin/sub/SKILL.md': skillText('Sub'),
    };
    const found = await scanSkillContainer(portOf(files), '/plugin', '.', request);
    expect(found.entries.map((entry) => entry.invocable.name)).toEqual(['pack']);
    expect(await found.entries[0]?.readBody()).toContain('Do the Root work.');
  });

  test('a folder that does not exist has no skills', async () => {
    const found = await scanSkillContainer(portOf({}), '/nowhere', 'skills', request);
    expect(found.entries).toEqual([]);
  });
});
