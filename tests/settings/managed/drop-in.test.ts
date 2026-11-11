/**
 * managed-settings.md § Split a file-based policy across teams: `managed-settings.json` first, then
 * every `*.json` file of `managed-settings.d/` in alphabetical order; single values replace, lists
 * combine without duplicates, nested blocks merge key by key, `fallbackModel`, `modelPicker`,
 * `extraKnownMarketplaces` and `managedMcpServers` follow their own rules. § Find entries Claude Code
 * dropped (a broken drop-in stops Claude Code). § How Claude Code combines managed sources (the
 * `/status` label of the file source).
 */
import { describe, expect, test } from 'bun:test';
import {
  composeManaged,
  dropInOrder,
  isDropInName,
  readFileDocument,
  type DropInFile,
  type ManagedFileRead,
} from '../../../src/settings/managed/index.ts';
import { DENIED, FAILED } from '../../support/managed.ts';
import { spec } from '../../support/spec.ts';

const SPLIT = 'settingsMerge.managed.Split a file-based policy across teams';

const DROPPED = 'policy.managed.Find entries Claude Code dropped';
const DIRECTORY = 'Managed settings drop-in directory could not be read';

const file = (name: string, value: unknown): DropInFile => ({ name, read: { value } });

/** The settings of `managed-settings.json` and the drop-ins as the file source composes them. */
function split(base: unknown, ...dropIns: DropInFile[]) {
  const read: ManagedFileRead = {
    base: base === undefined ? undefined : { value: base },
    dropIns: { files: dropIns },
  };
  return readFileDocument(read);
}

spec(SPLIT, () => {
  test('managed-settings.json is merged first, then every drop-in in alphabetical order', () => {
    const merged = split(
      { model: 'base' },
      file('20-security.json', { model: 'twenty' }),
      file('10-telemetry.json', { model: 'ten' }),
    );
    expect(merged.settings.model).toBe('twenty');
  });

  test('numeric prefixes control the order', () => {
    expect(dropInOrder(['20-security.json', '9-late.json', '10-telemetry.json', 'a.json'])).toEqual(
      ['10-telemetry.json', '20-security.json', '9-late.json', 'a.json'],
    );
  });

  test('hidden files and files that do not end in .json are ignored', () => {
    expect(isDropInName('.hidden.json')).toBe(false);
    expect(isDropInName('notes.txt')).toBe(false);
    expect(isDropInName('10-a.json.bak')).toBe(false);
    expect(isDropInName('10-a.json')).toBe(true);
    const merged = split(
      { model: 'base' },
      file('.10-hidden.json', { model: 'hidden' }),
      file('20-notes.txt', { model: 'text' }),
    );
    expect(merged.settings.model).toBe('base');
    expect(dropInOrder(['.x.json', 'b.txt', 'c.json'])).toEqual(['c.json']);
  });

  test('a drop-in directory without a managed-settings.json still makes the policy', () => {
    const merged = split(undefined, file('10-a.json', { model: 'a' }));
    expect(merged.delivers).toBe(true);
    expect(merged.settings.model).toBe('a');
    expect(merged.shape).toBe('drop-ins');
  });
});

spec(`${SPLIT}.Single values`, () => {
  test('the later file value replaces the earlier one', () => {
    const merged = split(
      { model: 'opus', cleanupPeriodDays: 30 },
      file('10-a.json', { cleanupPeriodDays: 7 }),
    );
    expect(merged.settings.model).toBe('opus');
    expect(merged.settings.cleanupPeriodDays).toBe(7);
  });
});

spec(`${SPLIT}.Lists`, () => {
  test('two lists combine with duplicates removed', () => {
    const merged = split(
      {
        permissions: { deny: ['Read(./.env)', 'Read(./a)'] },
        sandbox: { network: { allowedDomains: ['a.example'] } },
      },
      file('10-a.json', {
        permissions: { deny: ['Read(./a)', 'Read(./secrets/**)'] },
        sandbox: { network: { allowedDomains: ['b.example'] } },
      }),
    );
    expect(merged.settings.permissions?.deny?.toSorted()).toEqual([
      'Read(./.env)',
      'Read(./a)',
      'Read(./secrets/**)',
    ]);
    expect(merged.settings.sandbox?.network?.allowedDomains?.toSorted()).toEqual([
      'a.example',
      'b.example',
    ]);
  });
});

spec(`${SPLIT}.Nested blocks`, () => {
  test('env and sandbox merge key by key and each key follows the same rules', () => {
    const merged = split(
      {
        env: { A: '1', B: '1' },
        sandbox: { enabled: true, network: { allowedDomains: ['a.example'] } },
      },
      file('10-a.json', {
        env: { B: '2', C: '2' },
        sandbox: { network: { allowedDomains: ['b.example'] }, failIfUnavailable: true },
      }),
    );
    expect(merged.settings.env).toEqual({ A: '1', B: '2', C: '2' });
    expect(merged.settings.sandbox?.enabled).toBe(true);
    expect(merged.settings.sandbox?.failIfUnavailable).toBe(true);
    expect(merged.settings.sandbox?.network?.allowedDomains?.toSorted()).toEqual([
      'a.example',
      'b.example',
    ]);
  });
});

spec(`${SPLIT}.fallbackModel`, () => {
  test('the later chain replaces the earlier one whole', () => {
    const merged = split(
      { fallbackModel: ['opus', 'sonnet'] },
      file('10-a.json', { fallbackModel: ['haiku'] }),
    );
    expect(merged.settings.fallbackModel).toEqual(['haiku']);
  });

  test('a later file that does not set it leaves the earlier chain', () => {
    const merged = split({ fallbackModel: ['opus', 'sonnet'] }, file('10-a.json', { model: 'x' }));
    expect(merged.settings.fallbackModel).toEqual(['opus', 'sonnet']);
  });
});

describe('keys a later entry replaces whole', () => {
  test('extraKnownMarketplaces and managedMcpServers: a later entry with the same name replaces the earlier one', () => {
    const merged = split(
      {
        extraKnownMarketplaces: {
          shared: { source: { source: 'github', repo: 'a/b' }, autoUpdate: true },
          only: { source: { source: 'github', repo: 'c/d' } },
        },
        managedMcpServers: {
          shared: { type: 'http', url: 'https://one.example', headers: { a: 'b' } },
        },
      },
      file('10-a.json', {
        extraKnownMarketplaces: { shared: { source: { source: 'github', repo: 'e/f' } } },
        managedMcpServers: { shared: { type: 'http', url: 'https://two.example' } },
      }),
    );
    expect(merged.settings.extraKnownMarketplaces?.shared).toEqual({
      source: { source: 'github', repo: 'e/f' },
    });
    expect(Object.keys(merged.settings.extraKnownMarketplaces ?? {}).toSorted()).toEqual([
      'only',
      'shared',
    ]);
    expect(merged.settings.managedMcpServers?.shared).toEqual({
      type: 'http',
      url: 'https://two.example',
    });
  });

  test('modelPicker: the later lineup replaces the earlier one whole', () => {
    const merged = split(
      { modelPicker: { options: [{ model: 'opus', label: 'A' }], replaceBuiltInOptions: true } },
      file('10-a.json', { modelPicker: { options: [{ model: 'sonnet', label: 'B' }] } }),
    );
    expect(merged.settings.modelPicker).toEqual({ options: [{ model: 'sonnet', label: 'B' }] });
  });
});

describe('the file source as one document', () => {
  test('/status names it (file), (drop-ins) or (file + drop-ins)', () => {
    expect(split({ model: 'a' }).shape).toBe('file');
    expect(split(undefined, file('10-a.json', { model: 'a' })).shape).toBe('drop-ins');
    expect(split({ model: 'a' }, file('10-a.json', { model: 'b' })).shape).toBe('file + drop-ins');
  });

  test('Setting sources names the file source by its shape', () => {
    const line = (document: ReturnType<typeof split>) => composeManaged([document]).settingSources;
    expect(line(split({ model: 'a' }))).toBe('Enterprise managed settings (file)');
    expect(line(split(undefined, file('10-a.json', { model: 'a' })))).toBe(
      'Enterprise managed settings (drop-ins)',
    );
    expect(line(split({ model: 'a' }, file('10-a.json', { model: 'b' })))).toBe(
      'Enterprise managed settings (file + drop-ins)',
    );
  });

  test('a drop-in that is not a JSON object stops Claude Code and its issue names the file', () => {
    const merged = readFileDocument({
      base: { value: { model: 'a' } },
      dropIns: { files: [{ name: '10-bad.json', read: { value: '{ nope' } }] },
      label: { dropIn: (name) => `/etc/claude-code/managed-settings.d/${name}` },
    });
    expect(merged.broken).toBe(true);
    expect(
      merged.issues.some((issue) => issue.message.includes('managed-settings.d/10-bad.json')),
    ).toBe(true);
  });

  test('a drop-in directory that exists but cannot be read keeps the source present', () => {
    const merged = readFileDocument({ base: undefined, dropIns: DENIED });
    expect(merged.present).toBe(true);
    expect(merged.unreadable).toBe('denied');
  });

  test('no file and no directory is nothing', () => {
    const merged = readFileDocument({ base: undefined });
    expect(merged.present).toBe(false);
    expect(merged.delivers).toBe(false);
  });
});

const read = (dropIns: ManagedFileRead['dropIns'], base?: ManagedFileRead['base']) =>
  readFileDocument({ base, dropIns });

/** The messages of the exit and the issue a drop-in directory that failed comes to. */
const exits = (label?: string) =>
  composeManaged([
    readFileDocument({
      base: undefined,
      dropIns: FAILED,
      ...(label ? { label: { directory: label } } : {}),
    }),
  ]).issues.map((issue) => issue.message);

spec(`${DROPPED}.Managed settings file or drop-in file`, () => {
  test('a denied drop-in directory is a warning: the session starts without the source', () => {
    const merged = read(DENIED);
    expect(merged.issues).toEqual([
      {
        severity: 'warning',
        path: 'managed:managed-settings.d',
        message: `${DIRECTORY}: ${DENIED.reason}`,
      },
    ]);
    expect(composeManaged([merged]).fatal).toBe(false);
  });

  test('a drop-in directory that fails for another reason is an error carrying the underlying error', () => {
    const merged = read(FAILED);
    expect(merged.issues).toEqual([
      {
        severity: 'error',
        path: 'managed:managed-settings.d',
        message: `${DIRECTORY}: ${FAILED.reason}`,
      },
    ]);
    expect(composeManaged([merged]).fatal).toBe(true);
  });

  test('the exit names the directory, or the path the host gives, with the reason', () => {
    expect(exits()[1]).toContain(`Detail: managed-settings.d: ${FAILED.reason}`);
    expect(exits('/etc/claude-code/managed-settings.d')[1]).toContain(
      `Detail: /etc/claude-code/managed-settings.d: ${FAILED.reason}`,
    );
  });

  test('a failure that exits outranks a denial, in either order of the two files', () => {
    const labelled = { base: '/etc/claude-code/managed-settings.json' };
    const baseDenied = read(FAILED, DENIED);
    expect(baseDenied.unreadable).toBe('failed');
    const directoryDenied = readFileDocument({
      base: FAILED,
      dropIns: DENIED,
      label: labelled,
    });
    expect(directoryDenied.unreadable).toBe('failed');
    expect(directoryDenied.unreadableAt).toEqual({ label: labelled.base, reason: FAILED.reason });
    expect(composeManaged([baseDenied]).fatal).toBe(true);
    expect(composeManaged([directoryDenied]).fatal).toBe(true);
  });

  test('of two failures with the same cause the first one is named', () => {
    const merged = readFileDocument({
      base: DENIED,
      dropIns: { unreadable: 'denied', reason: 'EACCES: directory' },
    });
    expect(merged.unreadableAt?.reason).toBe(DENIED.reason);
  });
});
