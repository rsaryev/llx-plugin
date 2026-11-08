/**
 * plugins/cli-reference.md § plugin marketplace list (`Configured marketplaces:` and one `Source:`
 * line per marketplace, or `No marketplaces configured`; `--json` prints an array with one object
 * per marketplace whose fields are all strings: `name`, `source`, `repo`, `url`, `path`, `ref`,
 * `installLocation`; a claude.ai marketplace carries `marketplaceId` and `organizationUuid` in place
 * of `installLocation`, and `scope` when one is recorded, and `status`; the text ends with a `From
 * claude.ai:` section that `--json` leaves out). The layout of a text entry is outside `spec(...)`
 * and in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import {
  planMarketplaceList,
  type ConfiguredMarketplace,
  type ListedSource,
} from '../../src/cli/marketplace-list.ts';
import { spec } from '../support/spec.ts';

const FILE = '.claude-plugin/marketplace.json';

const github: ListedSource = { kind: 'github', repo: 'acme/tools', path: FILE };
const git: ListedSource = { kind: 'git', url: 'https://example.com/m.git', path: FILE };
const url: ListedSource = { kind: 'url', url: 'https://example.com/marketplace.json' };
const directory: ListedSource = { kind: 'directory', path: '/work/market' };
const file: ListedSource = { kind: 'file', path: '/work/market.json' };

const entry = (
  name: string,
  source: ListedSource,
  installLocation = `/cache/${name}`,
): ConfiguredMarketplace => ({ name, source, installLocation });

const jsonOf = (...marketplaces: ConfiguredMarketplace[]) =>
  planMarketplaceList({ marketplaces }).json;

const only = (marketplace: ConfiguredMarketplace) => {
  const [found] = jsonOf(marketplace);
  if (found === undefined) throw new Error('no entry');
  return found;
};

describe('the text listing', () => {
  test('prints Configured marketplaces: and one Source: line per marketplace', () => {
    const lines = planMarketplaceList({
      marketplaces: [entry('one', github), entry('two', directory)],
    }).text;
    expect(lines[0]).toBe('Configured marketplaces:');
    expect(lines.filter((line) => line.trim().startsWith('Source:'))).toHaveLength(2);
    expect(lines.join('\n')).toContain('one');
    expect(lines.join('\n')).toContain('acme/tools');
    expect(lines.join('\n')).toContain('/work/market');
  });

  test('prints No marketplaces configured when there are none', () => {
    expect(planMarketplaceList({ marketplaces: [] }).text).toEqual(['No marketplaces configured']);
    expect(planMarketplaceList({ marketplaces: [] }).json).toEqual([]);
  });

  test('names every source type on its Source: line', () => {
    const lines = planMarketplaceList({
      marketplaces: [
        entry('a', github),
        entry('b', git),
        entry('c', url),
        entry('d', directory),
        entry('e', file),
      ],
    }).text.filter((line) => line.trim().startsWith('Source:'));
    expect(lines.map((line) => line.trim())).toEqual([
      'Source: GitHub (acme/tools)',
      'Source: Git (https://example.com/m.git)',
      'Source: URL (https://example.com/marketplace.json)',
      'Source: Directory (/work/market)',
      'Source: File (/work/market.json)',
    ]);
  });

  test('a pinned ref is on the Source: line', () => {
    const lines = planMarketplaceList({
      marketplaces: [entry('a', { ...github, ref: 'v1.2' })],
    }).text;
    expect(lines.join('\n')).toContain('acme/tools#v1.2');
  });

  test('--json prints the array as the last stdout line, and an empty list prints []', () => {
    const plan = planMarketplaceList({ marketplaces: [entry('one', github)] });
    expect(plan.print(true)).toEqual({
      stdout: [JSON.stringify(plan.json)],
      stderr: [],
      exitCode: 0,
    });
    expect(plan.print(false).stdout).toEqual(plan.text);
    expect(planMarketplaceList({ marketplaces: [] }).print(true).stdout).toEqual(['[]']);
  });
});

spec('cli.plugin.plugin marketplace list.name', () => {
  test('is the marketplace name, one object per marketplace in the order given', () => {
    expect(jsonOf(entry('one', github), entry('two', url)).map((found) => found.name)).toEqual([
      'one',
      'two',
    ]);
  });
});

spec('cli.plugin.plugin marketplace list.source', () => {
  test('is github, git, url, directory or file for the source the marketplace was added from', () => {
    const sources = [github, git, url, directory, file].map(
      (source) => only(entry('m', source)).source,
    );
    expect(sources).toEqual(['github', 'git', 'url', 'directory', 'file']);
  });

  test('is claudeai for a marketplace hosted on claude.ai', () => {
    const hosted: ConfiguredMarketplace = {
      name: 'claudeai-library',
      source: { kind: 'claudeai', marketplaceId: 'mkt_1', organizationUuid: 'org-1' },
    };
    expect(only(hosted).source).toBe('claudeai');
  });

  test('every field is a string', () => {
    const found = only(entry('m', { ...github, ref: 'main' }));
    for (const value of Object.values(found)) expect(typeof value).toBe('string');
  });
});

spec('cli.plugin.plugin marketplace list.repo', () => {
  test('is owner/repo, for github sources only', () => {
    expect(only(entry('m', github)).repo).toBe('acme/tools');
    for (const source of [git, url, directory, file]) {
      expect('repo' in only(entry('m', source))).toBe(false);
    }
  });
});

spec('cli.plugin.plugin marketplace list.url', () => {
  test('is the clone or fetch URL, for git and url sources only', () => {
    expect(only(entry('m', git)).url).toBe('https://example.com/m.git');
    expect(only(entry('m', url)).url).toBe('https://example.com/marketplace.json');
    for (const source of [github, directory, file]) {
      expect('url' in only(entry('m', source))).toBe(false);
    }
  });
});

spec('cli.plugin.plugin marketplace list.path', () => {
  test('is the local path, for directory and file sources only', () => {
    expect(only(entry('m', directory)).path).toBe('/work/market');
    expect(only(entry('m', file)).path).toBe('/work/market.json');
    for (const source of [github, git, url]) {
      expect('path' in only(entry('m', source))).toBe(false);
    }
  });
});

spec('cli.plugin.plugin marketplace list.ref', () => {
  test('is the pinned branch or tag of a github or git source, only when pinned', () => {
    expect(only(entry('m', { ...github, ref: 'v1.2.0' })).ref).toBe('v1.2.0');
    expect(only(entry('m', { ...git, ref: 'release' })).ref).toBe('release');
    expect('ref' in only(entry('m', github))).toBe(false);
    expect('ref' in only(entry('m', git))).toBe(false);
  });

  test('a source that cannot be pinned has none', () => {
    expect('ref' in only(entry('m', url))).toBe(false);
    expect('ref' in only(entry('m', directory))).toBe(false);
  });
});

spec('cli.plugin.plugin marketplace list.installLocation', () => {
  test('is where Claude Code cached the marketplace', () => {
    expect(only(entry('m', github, '/home/u/.claude/plugins/marketplaces/m')).installLocation).toBe(
      '/home/u/.claude/plugins/marketplaces/m',
    );
  });

  test('a claude.ai marketplace has none: marketplaceId and organizationUuid stand in, with scope and status', () => {
    const hosted: ConfiguredMarketplace = {
      name: 'claudeai-library',
      source: { kind: 'claudeai', marketplaceId: 'mkt_1', organizationUuid: 'org-1' },
      scope: 'user',
      status: 'active',
    };
    expect(only(hosted)).toEqual({
      name: 'claudeai-library',
      source: 'claudeai',
      marketplaceId: 'mkt_1',
      organizationUuid: 'org-1',
      scope: 'user',
      status: 'active',
    });
  });

  test('scope and status are left out of a claude.ai entry that records none', () => {
    const hosted: ConfiguredMarketplace = {
      name: 'claudeai-library',
      source: { kind: 'claudeai', marketplaceId: 'mkt_1', organizationUuid: 'org-1' },
    };
    expect('scope' in only(hosted)).toBe(false);
    expect('installLocation' in only(hosted)).toBe(false);
  });
});

describe('the From claude.ai: section', () => {
  const listed = [{ name: 'claudeai-organization-library' }];

  test('ends the text listing with the marketplaces claude.ai lists that are not added', () => {
    const lines = planMarketplaceList({
      marketplaces: [entry('one', github)],
      fromClaudeAi: listed,
    }).text;
    expect(lines.at(-2)).toBe('From claude.ai:');
    expect(lines.at(-1)).toContain('claudeai-organization-library');
  });

  test('the --json output leaves it out', () => {
    const plan = planMarketplaceList({
      marketplaces: [entry('one', github)],
      fromClaudeAi: listed,
    });
    expect(JSON.stringify(plan.json)).not.toContain('claudeai-organization-library');
  });

  test('is still printed when nothing is configured', () => {
    const lines = planMarketplaceList({ marketplaces: [], fromClaudeAi: listed }).text;
    expect(lines[0]).toBe('No marketplaces configured');
    expect(lines).toContain('From claude.ai:');
  });
});
