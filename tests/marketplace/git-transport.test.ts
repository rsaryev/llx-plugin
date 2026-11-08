/**
 * plugins/install.md § Add a private marketplace (HTTPS, SSH, GitHub `owner/repo` shorthand), § Add a
 * marketplace (the sources table); env-vars.md § `CLAUDE_CODE_PLUGIN_PREFER_HTTPS`. The names of the
 * variables that switch prompts off are a judgment, tested outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import {
  NO_PROMPT_ENVIRONMENT,
  clonePlan,
  shorthandTransport,
} from '../../src/marketplace/git-transport.ts';
import { shorthandAttempts } from '../../src/marketplace/git-transport.ts';
import { parseMarketplaceInput } from '../../src/marketplace/marketplace-input.ts';
import { spec } from '../support/spec.ts';

const G = 'install.guide.Add a private marketplace.';
const FORM = 'install.guide.Add a marketplace.';

spec(`${G}HTTPS`, () => {
  test('an HTTPS URL is a git source, cloned with the user credential helpers and no prompt', () => {
    expect(parseMarketplaceInput('https://git.example.com/team/m.git')).toMatchObject({
      kind: 'git',
    });
    expect(clonePlan().environment.GIT_TERMINAL_PROMPT).toBe('0');
  });
  test('an askpass program set in GIT_ASKPASS is switched off too', () => {
    expect(clonePlan().environment.GIT_ASKPASS).toBe('');
  });
});

spec(`${G}SSH`, () => {
  test('user@host:path is a git source', () => {
    expect(parseMarketplaceInput('git@git.example.com:team/m.git')).toMatchObject({ kind: 'git' });
  });
  test('the key must work without a passphrase prompt', () => {
    expect(clonePlan().sshProgram).toBe('ssh-batch-mode');
  });
  test('an SSH program named by GIT_SSH_COMMAND, GIT_SSH or core.sshCommand is the one that runs', () => {
    for (const facts of [
      { gitSshCommand: 'ssh -i k' },
      { gitSsh: '/bin/s' },
      { coreSshCommand: 's' },
    ]) {
      expect(clonePlan(facts).sshProgram).toBe('user-configured');
    }
    expect(clonePlan({ gitSshCommand: '' }).sshProgram).toBe('ssh-batch-mode');
  });
});

spec(
  [`${G}GitHub owner/repo shorthand`, 'environment.host.CLAUDE_CODE_PLUGIN_PREFER_HTTPS'],
  () => {
    test('SSH when the key authenticates to github.com, HTTPS when it does not', () => {
      expect(shorthandTransport({ preferHttps: false, sshAuthenticates: () => true })).toBe('ssh');
      expect(shorthandTransport({ preferHttps: false, sshAuthenticates: () => false })).toBe(
        'https',
      );
    });
    test('PREFER_HTTPS skips the check and always clones over HTTPS', () => {
      let checked = false;
      const transport = shorthandTransport({
        preferHttps: true,
        sshAuthenticates: () => {
          checked = true;
          return true;
        },
      });
      expect(transport).toBe('https');
      expect(checked).toBe(false);
    });
  },
);

const HOST = 'marketplace.hosting.Grant access to a private marketplace.';

spec(
  [`${HOST}GitHub owner/repo`, 'marketplace.hosting.Serve users who have no git-host account'],
  () => {
    test('SSH is tried when the probe succeeds, with HTTPS after it if the SSH clone fails', () => {
      expect(shorthandAttempts({ preferHttps: false, sshAuthenticates: () => true })).toEqual([
        'ssh',
        'https',
      ]);
    });
    test('when the probe fails, or with PREFER_HTTPS, only HTTPS is tried', () => {
      expect(shorthandAttempts({ preferHttps: false, sshAuthenticates: () => false })).toEqual([
        'https',
      ]);
      expect(shorthandAttempts({ preferHttps: true, sshAuthenticates: () => true })).toEqual([
        'https',
      ]);
    });
  },
);

spec(`${HOST}git@host:path.git`, () => {
  test('the form is SSH', () => {
    expect(parseMarketplaceInput('git@example.com:team/repo.git')).toMatchObject({
      kind: 'git',
      url: 'git@example.com:team/repo.git',
    });
  });
});

spec([`${HOST}https://example.com/repo.git`, `${HOST}HTTPS`, `${HOST}SSH`], () => {
  test('the form is HTTPS, and the clone forbids prompts and askpass programs', () => {
    expect(parseMarketplaceInput('https://example.com/repo.git')).toMatchObject({
      kind: 'git',
      url: 'https://example.com/repo.git',
    });
    expect(clonePlan().environment).toMatchObject({ GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '' });
  });
  test('SSH needs a key that works without a prompt', () => {
    expect(clonePlan().sshProgram).toBe('ssh-batch-mode');
  });
});

describe('the sources table of "Add a marketplace"', () => {
  spec(`${FORM}GitHub repository`, () => {
    test('owner/repo, with #ref to pin a branch or tag', () => {
      expect(parseMarketplaceInput('anthropics/claude-plugins-official')).toMatchObject({
        kind: 'github',
        repo: 'anthropics/claude-plugins-official',
      });
      expect(parseMarketplaceInput('your-org/plugins#v1.2.0')).toMatchObject({
        kind: 'github',
        ref: 'v1.2.0',
      });
    });
  });
  spec(`${FORM}Git repository on any host`, () => {
    test('the full clone URL, with #ref to pin a branch or tag', () => {
      expect(
        parseMarketplaceInput('https://gitlab.example.com/your-group/your-marketplace.git#v1.0.0'),
      ).toMatchObject({
        kind: 'git',
        url: 'https://gitlab.example.com/your-group/your-marketplace.git',
        ref: 'v1.0.0',
      });
    });
    test('a bare host without https:// is read as GitHub shorthand and rejected', () => {
      expect(
        parseMarketplaceInput('gitlab.example.com/your-group/your-marketplace.git'),
      ).toHaveProperty('severity', 'error');
    });
  });
  spec(`${FORM}Local directory or file`, () => {
    test('a relative or absolute path to a directory, or to the JSON file itself', () => {
      expect(parseMarketplaceInput('./my-marketplace')).toMatchObject({ kind: 'directory' });
      expect(parseMarketplaceInput('../my-marketplace')).toMatchObject({ kind: 'directory' });
      expect(parseMarketplaceInput('/abs/marketplace.json')).toMatchObject({ kind: 'file' });
    });
    test('a bare name/name is a GitHub repository, so a relative path starts with ./', () => {
      expect(parseMarketplaceInput('my/marketplace')).toMatchObject({ kind: 'github' });
    });
  });
  spec(`${FORM}marketplace.json`, () => {
    test('a hosted marketplace.json is its https:// URL', () => {
      expect(parseMarketplaceInput('https://example.com/marketplace.json')).toMatchObject({
        kind: 'url',
      });
    });
  });
});

describe('judgment: the prompt switches', () => {
  test('GIT_TERMINAL_PROMPT, GIT_ASKPASS, SSH_ASKPASS and GCM_INTERACTIVE are set', () => {
    expect(Object.keys(NO_PROMPT_ENVIRONMENT).sort()).toEqual([
      'GCM_INTERACTIVE',
      'GIT_ASKPASS',
      'GIT_TERMINAL_PROMPT',
      'SSH_ASKPASS',
    ]);
  });
});
