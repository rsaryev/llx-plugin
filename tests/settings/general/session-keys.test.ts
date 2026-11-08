/**
 * settings-reference.md § `agent` (any file; a string; unset by default; `--agent` for one session),
 * § `disableAgentView` (a Boolean; `CLAUDE_CODE_DISABLE_AGENT_VIEW` for one session, and whichever of
 * the two turns it off, the other cannot turn it back on), § `outputStyle` (a string, unset means the
 * default style) and § `teammateMode` (four values, `"in-process"` by default, `--teammate-mode`, and
 * a value left in `~/.claude.json` by older versions).
 */
import { expect, test } from 'bun:test';
import {
  agentViewDisabled,
  readAgent,
  readOutputStyle,
  readTeammateMode,
  resolveSessionValue,
} from '../../../src/settings/general/index.ts';
import { issuesOf } from '../../support/settings-layers.ts';
import { viewOf } from '../../support/plugin-settings.ts';
import { spec } from '../../support/spec.ts';

const NO_ENV = {};

spec('settings.key.agent', () => {
  test('the docs example names the agent the main thread runs as', () => {
    expect(readAgent(viewOf(['user', { agent: 'code-reviewer' }]))).toBe('code-reviewer');
  });

  test('any file carries it, and the highest file wins', () => {
    for (const scope of ['user', 'project', 'local', 'managed', 'flag'] as const) {
      expect(readAgent(viewOf([scope, { agent: 'a' }]))).toBe('a');
    }
    expect(readAgent(viewOf(['user', { agent: 'user' }], ['project', { agent: 'project' }]))).toBe(
      'project',
    );
    expect(readAgent(viewOf(['managed', { agent: 'org' }], ['local', { agent: 'mine' }]))).toBe(
      'org',
    );
  });

  test('it is unset by default, so the main thread runs as the default agent', () => {
    expect(readAgent(viewOf())).toBeUndefined();
  });

  test('it is a string: another type is dropped with a warning that names the key', () => {
    expect(readAgent(viewOf(['user', { agent: 3 }]))).toBeUndefined();
    expect(issuesOf('user', { agent: ['a'] })[0]?.message).toContain('"agent" must be a string');
  });

  test('--agent takes precedence over the key for one session', () => {
    const file = readAgent(viewOf(['user', { agent: 'from-file' }]));
    const input = (flags: Record<string, string>) => ({ flags, env: NO_ENV, settingsValue: file });
    expect(resolveSessionValue('agent', input({ '--agent': 'from-flag' }))).toEqual({
      value: 'from-flag',
      from: '--agent',
    });
    expect(resolveSessionValue('agent', input({}))?.value).toBe('from-file');
  });
});

spec('settings.key.disableAgentView', () => {
  const disabled = (settings: object, env: Record<string, string> = {}) =>
    agentViewDisabled(viewOf(['user', settings]), env);

  test('true turns agent view off, false and unset leave it available', () => {
    expect(disabled({ disableAgentView: true }).disabled).toBe(true);
    expect(disabled({ disableAgentView: false }).disabled).toBe(false);
    expect(disabled({}).disabled).toBe(false);
  });

  test('any file carries it, managed settings included', () => {
    for (const scope of ['user', 'project', 'local', 'managed'] as const) {
      expect(agentViewDisabled(viewOf([scope, { disableAgentView: true }]), {}).disabled).toBe(
        true,
      );
    }
  });

  test('CLAUDE_CODE_DISABLE_AGENT_VIEW turns it off for one session', () => {
    const result = disabled({}, { CLAUDE_CODE_DISABLE_AGENT_VIEW: '1' });
    expect(result).toEqual({ disabled: true, offBy: ['env'] });
  });

  test('whichever of the two turns it off, the other cannot turn it back on', () => {
    expect(
      disabled({ disableAgentView: false }, { CLAUDE_CODE_DISABLE_AGENT_VIEW: '1' }).disabled,
    ).toBe(true);
    expect(disabled({ disableAgentView: true }, { CLAUDE_CODE_DISABLE_AGENT_VIEW: '0' })).toEqual({
      disabled: true,
      offBy: ['disableAgentView'],
    });
    expect(
      disabled({ disableAgentView: true }, { CLAUDE_CODE_DISABLE_AGENT_VIEW: '1' }).offBy,
    ).toEqual(['disableAgentView', 'env']);
  });

  test('a variable that is off or unset does not turn agent view off', () => {
    for (const value of ['0', 'false', 'no', 'off', '']) {
      expect(disabled({}, { CLAUDE_CODE_DISABLE_AGENT_VIEW: value }).disabled).toBe(false);
    }
    for (const value of ['1', 'true', 'YES', 'On']) {
      expect(disabled({}, { CLAUDE_CODE_DISABLE_AGENT_VIEW: value }).disabled).toBe(true);
    }
  });

  test('a value that is not a Boolean is dropped with a warning', () => {
    expect(issuesOf('user', { disableAgentView: 'yes' })[0]?.message).toContain(
      '"disableAgentView" must be true or false',
    );
  });
});

spec('settings.key.outputStyle', () => {
  test('the docs example selects the built-in Explanatory style', () => {
    expect(readOutputStyle(viewOf(['user', { outputStyle: 'Explanatory' }]))).toBe('Explanatory');
  });

  test('unset by default, so the default style is used', () => {
    expect(readOutputStyle(viewOf())).toBeUndefined();
  });

  test('any file carries it and the highest file wins', () => {
    expect(
      readOutputStyle(
        viewOf(['user', { outputStyle: 'Learning' }], ['local', { outputStyle: 'mine' }]),
      ),
    ).toBe('mine');
    expect(
      readOutputStyle(
        viewOf(['managed', { outputStyle: 'org' }], ['local', { outputStyle: 'mine' }]),
      ),
    ).toBe('org');
  });

  test('a value that is not a string is dropped with a warning', () => {
    expect(readOutputStyle(viewOf(['user', { outputStyle: true }]))).toBeUndefined();
    expect(issuesOf('user', { outputStyle: 1 })[0]?.message).toContain(
      '"outputStyle" must be a string',
    );
  });
});

spec('settings.key.teammateMode', () => {
  test('the four documented values are read as they are', () => {
    for (const mode of ['in-process', 'auto', 'tmux', 'iterm2'] as const) {
      expect(readTeammateMode(viewOf(['user', { teammateMode: mode }]))).toBe(mode);
    }
  });

  test('the default is in-process', () => {
    expect(readTeammateMode(viewOf())).toBe('in-process');
  });

  test('any file carries it and the highest file wins', () => {
    expect(
      readTeammateMode(
        viewOf(['user', { teammateMode: 'tmux' }], ['project', { teammateMode: 'auto' }]),
      ),
    ).toBe('auto');
  });

  test('another value is dropped with a warning, and the default or a lower file applies', () => {
    expect(issuesOf('user', { teammateMode: 'split' })[0]?.message).toContain(
      '"teammateMode" must be one of',
    );
    expect(
      readTeammateMode(
        viewOf(['user', { teammateMode: 'tmux' }], ['project', { teammateMode: 'split' }]),
      ),
    ).toBe('tmux');
    expect(readTeammateMode(viewOf(['user', { teammateMode: 'split' }]))).toBe('in-process');
  });

  test('a value left in ~/.claude.json by an older version applies when no settings file sets it', () => {
    expect(readTeammateMode(viewOf(), 'tmux')).toBe('tmux');
    expect(readTeammateMode(viewOf(['user', { teammateMode: 'auto' }]), 'tmux')).toBe('auto');
    expect(readTeammateMode(viewOf(), 'split')).toBe('in-process');
  });

  test('--teammate-mode takes precedence over the key for one session', () => {
    const settingsValue = readTeammateMode(viewOf(['user', { teammateMode: 'auto' }]));
    expect(
      resolveSessionValue('teammateMode', {
        flags: { '--teammate-mode': 'iterm2' },
        env: NO_ENV,
        settingsValue,
      }),
    ).toEqual({ value: 'iterm2', from: '--teammate-mode' });
    expect(
      resolveSessionValue('teammateMode', { flags: {}, env: NO_ENV, settingsValue })?.value,
    ).toBe('auto');
  });
});
