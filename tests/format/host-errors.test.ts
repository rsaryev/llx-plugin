/**
 * errors.md: each notice, warning and error quoted in its section, built in the page's wording.
 * Where the page names the variable part of a message (a name, a count, a path, a cause) the
 * builder takes it; where it leaves the joining of the parts open, the kit's reading is a row in
 * spec/judgments.md.
 */
import { expect, test } from 'bun:test';
import {
  BASH_DENY_TURNS_OFF_POWERSHELL,
  ELICITATION_REJECTED,
  MANAGED_SETTINGS_NEED_APPROVAL,
  MANAGED_SETTINGS_NOT_APPROVED,
  agentDescriptionsOverLimit,
  cannotAddMcpToManagedScope,
  fileToolRuleBannerRow,
  fileToolRuleWarning,
  hookNeedsQuotes,
  manifestNotRead,
  marketplaceNameRefused,
  matchesNoToolBannerRow,
  mcpJsonUnreadable,
  mcpServerDisabled,
  mcpServerNameReserved,
  noSuchTool,
  organizationSettingsUnavailable,
  pathCouldNotBeChecked,
  pathCouldNotBeCheckedInList,
  REMOTE_MANAGED_SETTINGS_DID_NOT_LOAD,
  REMOTE_MANAGED_SETTINGS_STILL_LOADING,
  remoteManagedSettingsFailed,
  remoteManagedSettingsLoaded,
  reservedSkillNameNotice,
  reservedSpellingIgnored,
  reservedSpellingRefusal,
  sandboxAllowIgnored,
  skillNamesRefused,
} from '../../src/format/host-errors.ts';
import { spec } from '../support/spec.ts';

const E = 'cli.errors.';

spec(`${E}A skill, command, or workflow wasn't loaded because its name is reserved`, () => {
  test('names the item to rename and counts the others', () => {
    const rename = '.claude/skills/anthropic-skills';
    const notice =
      'Not loaded: rename .claude/skills/anthropic-skills, then restart — its name uses "anthropic-skills", a name reserved for the skills synced from your claude.ai account';
    expect(reservedSkillNameNotice({ rename, name: 'anthropic-skills' })).toBe(notice);
    expect(reservedSkillNameNotice({ rename, name: 'anthropic-skills', more: 2 })).toBe(
      `${notice} · 2 more`,
    );
  });
});

spec(`${E}Agent descriptions are over the 15.0k-token limit`, () => {
  test('shows the estimate in thousands and the agents folder', () => {
    expect(agentDescriptionsOverLimit(16_200, '.claude/agents/')).toBe(
      'Agent descriptions are over the 15.0k-token limit (~16.2k tokens) · ask Claude to trim agent descriptions in .claude/agents/',
    );
  });
});

spec(`${E}Can't read .mcp.json`, () => {
  test('names the 2 MiB limit in bytes', () => {
    expect(mcpJsonUnreadable()).toBe(
      "Can't read .mcp.json: it isn't a regular file or is larger than 2097152 bytes. Fix or remove it, then run the command again.",
    );
  });
});

spec(`${E}Cannot add MCP server to the managed scope`, () => {
  test('is one line', () => {
    expect(cannotAddMcpToManagedScope()).toBe('Cannot add MCP server to scope: managed');
  });
});

spec(`${E}Claude Code couldn't load your organization's settings`, () => {
  test('names the cause and the organization', () => {
    expect(organizationSettingsUnavailable('could not connect', 'Acme')).toBe(
      "Claude Code couldn't reach Anthropic to load your organization's settings (could not connect). Acme requires them before a session can start.",
    );
  });
});

spec(`${E}Claude Code refuses the marketplace name`, () => {
  test('quotes the name', () => {
    expect(marketplaceNameRefused('anthropic-plugins-v2')).toBe(
      'Claude Code refuses the marketplace name "anthropic-plugins-v2"',
    );
  });
});

spec(`${E}Denying Bash also turns off the PowerShell tool`, () => {
  test('is the documented warning', () => {
    expect(BASH_DENY_TURNS_OFF_POWERSHELL).toBe(
      'Denying Bash also turns off the PowerShell tool, so Claude has neither. To use PowerShell, set CLAUDE_CODE_USE_POWERSHELL_TOOL=1.',
    );
  });
});

spec(`${E}Hook needs quotes around a path with a space`, () => {
  test('starts with the event and names the script', () => {
    expect(hookNeedsQuotes('Stop', 'check.py')).toBe(
      'Stop hook needs quotes around a path with a space (check.py)',
    );
  });
});

spec(`${E}Is not matched by file permission checks`, () => {
  test('a deny rule has a banner row and a full warning naming its source', () => {
    expect(fileToolRuleBannerRow('deny', 'Write(docs/**)', 'Edit(docs/**)')).toBe(
      '⚠ Deny rule Write(docs/**) never matches · use Edit(docs/**)',
    );
    expect(
      fileToolRuleWarning({
        behavior: 'deny',
        source: '.claude/settings.json',
        rule: 'Write(docs/**)',
        use: 'Edit',
        replacement: 'Edit(docs/**)',
      }),
    ).toBe(
      'Permission deny rule (.claude/settings.json): Write(docs/**) is not matched by file permission checks — only Edit(path) rules are. Use Edit(docs/**) instead (Edit rules cover all file-editing tools).',
    );
  });
});

spec(`${E}Managed settings need your approval`, () => {
  test('is the documented error', () => {
    expect(MANAGED_SETTINGS_NEED_APPROVAL).toBe(
      "Your organization's managed settings need your approval, which couldn't be asked for here. Run `claude` in a terminal and approve them, then run this command again.",
    );
  });
});

spec(`${E}Managed settings were not approved`, () => {
  test('is the documented exit line', () => {
    expect(MANAGED_SETTINGS_NOT_APPROVED).toBe(
      'Managed settings were not approved; exiting without applying them.',
    );
  });
});

spec(`${E}Marketplace name is another spelling of a reserved name`, () => {
  test('the add refusal and the ignored-entry warning', () => {
    expect(reservedSpellingRefusal('claude.code.plugins', 'claude-code-plugins', false)).toBe(
      'Failed to add marketplace: "claude.code.plugins" is another spelling of "claude-code-plugins", a reserved marketplace name.',
    );
    expect(reservedSpellingIgnored('claude.code.plugins', 'claude-code-plugins')).toBe(
      'known_marketplaces.json has an entry named "claude.code.plugins", another spelling of the reserved marketplace name "claude-code-plugins", so it is ignored. Remove it with: claude plugin marketplace remove claude.code.plugins',
    );
  });

  test('a name that would need shell quoting gets the other wording', () => {
    expect(reservedSpellingRefusal("a b'", 'claude-code-plugins', true)).toBe(
      'This marketplace\'s name is another spelling of "claude-code-plugins", a reserved marketplace name. It is not exactly the reserved name it appears to be.',
    );
  });
});

spec(`${E}Matches no tool · check for typos`, () => {
  test('the banner row repeats the rule', () => {
    expect(matchesNoToolBannerRow('deny', 'Bsh')).toBe(
      '⚠ Deny rule Bsh matches no tool · check for typos',
    );
  });
});

spec(`${E}MCP server is disabled`, () => {
  test('is the tool result in place of a call', () => {
    expect(mcpServerDisabled('github')).toBe(
      'MCP server "github" is disabled — re-enable it via /mcp to use its tools',
    );
  });
});

spec(`${E}MCP server name is reserved`, () => {
  test('quotes the name', () => {
    expect(mcpServerNameReserved('workspace')).toBe(
      '"workspace" is a reserved MCP server name and was not loaded',
    );
  });
});

spec(`${E}MCP server rejected the elicitation capability`, () => {
  test('says what to set or upgrade', () => {
    expect(ELICITATION_REJECTED).toBe(
      'This server (Java MCP SDK 0.17.0 or older) rejected Claude Code\'s elicitation capability. Set "bareElicitationCapability": true for it, or upgrade to Java MCP SDK 0.17.1+ (Spring AI 1.0.7+ or 1.1.6+).',
    );
  });
});

spec(`${E}No such tool available`, () => {
  test('is an error result, with a reason after the name when one is known', () => {
    expect(noSuchTool('Foo')).toBe('Error: No such tool available: Foo');
    expect(noSuchTool('read', 'Tool names are case-sensitive: call Read instead.')).toBe(
      'Error: No such tool available: read. Tool names are case-sensitive: call Read instead.',
    );
  });
});

spec(
  [
    `${E}Path could not be checked`,
    `${E}Path could not be checked.EACCES`,
    `${E}Path could not be checked.EIO`,
    `${E}Path could not be checked.ELOOP`,
  ],
  () => {
    test.each(['ELOOP', 'EIO', 'EACCES'])('names the path and the code %s', (code) => {
      expect(pathCouldNotBeChecked('skills', '/home/user/my-plugin/skills', code)).toBe(
        `skills path could not be checked: /home/user/my-plugin/skills (${code})`,
      );
      expect(pathCouldNotBeCheckedInList('skills', '/home/user/my-plugin/skills', code)).toBe(
        `Path not found: /home/user/my-plugin/skills (skills, ${code})`,
      );
    });
  },
);

spec(`${E}Plugin not loaded: its manifest was not read`, () => {
  test('gives the manifest path and the reason', () => {
    expect(
      manifestNotRead(
        '/home/user/my-marketplace/my-plugin/.claude-plugin/plugin.json',
        'it resolves to /home/user/dotfiles/my-plugin/.claude-plugin/plugin.json, outside the plugin directory and its marketplace directory',
      ),
    ).toBe(
      'Plugin not loaded: its manifest /home/user/my-marketplace/my-plugin/.claude-plugin/plugin.json was not read, because it resolves to /home/user/dotfiles/my-plugin/.claude-plugin/plugin.json, outside the plugin directory and its marketplace directory',
    );
  });
});

spec(`${E}Sandbox allow entries are ignored under a managed lock`, () => {
  test('the read lock and the network lock', () => {
    expect(
      sandboxAllowIgnored({ lock: 'read', count: 3, file: '/home/you/.claude/settings.json' }),
    ).toBe(
      'sandbox.filesystem.allowRead is ignored — managed settings set allowManagedReadPathsOnly, so only allowRead paths from managed settings are honored. The 3 entries in /home/you/.claude/settings.json will NOT apply (see https://code.claude.com/docs/en/settings#sandbox-settings).',
    );
    const network = sandboxAllowIgnored({
      lock: 'domains',
      count: 2,
      file: '.claude/settings.json',
    });
    expect(network).toContain('sandbox.network.allowedDomains is ignored');
    expect(network).toContain('allowManagedDomainsOnly');
    expect(network).toContain(
      'only allowed domains (and WebFetch domain rules) from managed settings are honored',
    );
  });
});

spec(`${E}Skill or command name refused`, () => {
  test('counts the names', () => {
    expect(skillNamesRefused(1)).toBe(
      '1 skill or command name refused: run with --debug to see which ([names]), rename, then restart — a name may not hold hidden, direction-changing or blank-like characters, < or >, or be over 256 characters',
    );
  });
});

spec(
  [
    `${E}Remote managed settings failed to load`,
    `${E}Remote managed settings failed to load.No cache`,
    `${E}Remote managed settings failed to load.Remote managed settings did not load`,
    `${E}Remote managed settings failed to load.Remote managed settings have now loaded`,
  ],
  () => {
    test('the warning names the cause and the policy the session runs on', () => {
      const cached = remoteManagedSettingsFailed('request timed out', 'cached');
      expect(cached).toStartWith('Remote managed settings failed to load (request timed out)');
      expect(cached).toEndWith('using cached policy');
      expect(remoteManagedSettingsFailed('network error', 'none')).toEndWith(
        'no remote policy applied',
      );
    });

    test('the related state lines', () => {
      expect(REMOTE_MANAGED_SETTINGS_STILL_LOADING).toBe(
        'Remote managed settings are still loading',
      );
      expect(REMOTE_MANAGED_SETTINGS_DID_NOT_LOAD).toBe('Remote managed settings did not load');
      expect(remoteManagedSettingsLoaded(true)).toStartWith(
        'Remote managed settings have now loaded',
      );
      expect(remoteManagedSettingsLoaded(false)).toEndWith('no remote policy applied');
    });
  },
);
