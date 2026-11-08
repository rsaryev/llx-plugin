/**
 * settings-reference.md § `httpHookAllowedEnvVars` ("An HTTP hook can put the value of an
 * environment variable into a request header ... but only for variables the hook lists in its own
 * `allowedEnvVars`. This key sets an outer limit on that list for every HTTP hook: a hook can use a
 * variable only if both its own `allowedEnvVars` and this key name it"; Scope: Any file, "Arrays merge
 * across settings files"; default unset, "so each hook's own `allowedEnvVars` list applies"; "The
 * allowlist applies to hooks from every source, including managed settings"), hooks.md § "HTTP hook
 * fields" (`allowedEnvVars`: "References to unlisted variables are replaced with empty strings.
 * Required for any env var interpolation to work") and § "Hooks in plugins/managed policy" ("when
 * defined, Claude Code interpolates only the environment variables on that list into hook headers"),
 * managed-settings.md § "Keys that fail closed" (an unreadable managed value is an empty allowlist "so
 * a header variable is interpolated only if another settings file names it"; an invalid entry is
 * stripped and the rest enforced).
 */
import { describe, expect, test } from 'bun:test';
import { issuesOf, plain } from '../../support/settings-layers.ts';
import {
  fromManaged,
  hookPolicyOf,
  local,
  managed,
  project,
  runs,
  user,
} from '../../support/hook-policy.ts';
import { spec } from '../../support/spec.ts';

const url = 'https://hooks.example.com/notify';
const interpolated = (
  policy: ReturnType<typeof hookPolicyOf>,
  own: readonly string[],
): readonly string[] | undefined => {
  const verdict = policy.httpHook(url, own);
  return verdict.run ? verdict.interpolate : undefined;
};

spec('settings.key.httpHookAllowedEnvVars', () => {
  describe('unset', () => {
    test("each hook's own allowedEnvVars list applies", () => {
      const policy = hookPolicyOf([user({})]);
      expect(interpolated(policy, ['MY_TOKEN', 'HOOK_SECRET'])).toEqual([
        'MY_TOKEN',
        'HOOK_SECRET',
      ]);
    });

    test('a hook with no list interpolates nothing: the list is required', () => {
      expect(interpolated(hookPolicyOf([user({})]), [])).toEqual([]);
    });
  });

  describe('defined: an outer limit on the hook list', () => {
    const policy = hookPolicyOf([user({ httpHookAllowedEnvVars: ['MY_TOKEN', 'HOOK_SECRET'] })]);

    test('a variable is used only if both the hook and the key name it', () => {
      expect(interpolated(policy, ['MY_TOKEN', 'AWS_SECRET_ACCESS_KEY'])).toEqual(['MY_TOKEN']);
      expect(interpolated(policy, ['MY_TOKEN', 'HOOK_SECRET'])).toEqual([
        'MY_TOKEN',
        'HOOK_SECRET',
      ]);
    });

    test('a hook asking for a secret outside the key gets none of it', () => {
      expect(interpolated(policy, ['AWS_SECRET_ACCESS_KEY'])).toEqual([]);
    });

    test('a variable only the key names is not added to a hook that did not ask for it', () => {
      expect(interpolated(policy, [])).toEqual([]);
      expect(interpolated(policy, ['MY_TOKEN'])).toEqual(['MY_TOKEN']);
    });

    test('names are exact: case counts', () => {
      expect(interpolated(policy, ['my_token'])).toEqual([]);
    });

    test('an empty array leaves no variable for any hook', () => {
      const none = hookPolicyOf([user({ httpHookAllowedEnvVars: [] })]);
      expect(interpolated(none, ['MY_TOKEN'])).toEqual([]);
    });

    test('the URL decision is separate: the hook still runs', () => {
      expect(plain(policy.httpHook(url, ['NOPE']))).toEqual({ run: true, interpolate: [] });
    });
  });

  describe('merging across files (Scope: Any file)', () => {
    test('the names of every file are joined', () => {
      const policy = hookPolicyOf([
        managed({ httpHookAllowedEnvVars: ['ORG_TOKEN'] }),
        user({ httpHookAllowedEnvVars: ['USER_TOKEN'] }),
        project({ httpHookAllowedEnvVars: ['PROJECT_TOKEN'] }),
        local({ httpHookAllowedEnvVars: ['LOCAL_TOKEN'] }),
      ]);
      expect(
        interpolated(policy, ['PROJECT_TOKEN', 'ORG_TOKEN', 'USER_TOKEN', 'LOCAL_TOKEN', 'OTHER']),
      ).toEqual(['PROJECT_TOKEN', 'ORG_TOKEN', 'USER_TOKEN', 'LOCAL_TOKEN']);
    });

    test('one file that defines the key limits the hooks configured in any file', () => {
      const policy = hookPolicyOf([project({}), user({ httpHookAllowedEnvVars: ['A'] })]);
      expect(interpolated(policy, ['A', 'B'])).toEqual(['A']);
    });

    test('a developer can add to an empty managed list', () => {
      const policy = hookPolicyOf([
        managed({ httpHookAllowedEnvVars: [] }),
        user({ httpHookAllowedEnvVars: ['MINE'] }),
      ]);
      expect(interpolated(policy, ['MINE', 'ORG'])).toEqual(['MINE']);
    });
  });

  describe('applies to hooks from every source, managed settings included', () => {
    // Design: `httpHook` takes no origin, so no origin can be exempt from the limit. It composes with
    // `runs(origin)`, which keeps a managed hook running while the variables are still limited.
    test('a managed HTTP hook runs by origin and still loses the unlisted variables', () => {
      const policy = hookPolicyOf([
        managed({ allowManagedHooksOnly: true, httpHookAllowedEnvVars: ['OK'] }),
      ]);
      expect(runs(policy, fromManaged)).toBe(true);
      expect(interpolated(policy, ['OK', 'NOT_OK'])).toEqual(['OK']);
    });
  });

  describe('an unreadable value in managed settings (fails closed)', () => {
    test('a value that is not a list is an empty allowlist until it is fixed', () => {
      const raw = { httpHookAllowedEnvVars: 'MY_TOKEN' };
      expect(issuesOf('managed', raw)).not.toEqual([]);
      expect(interpolated(hookPolicyOf([managed(raw)]), ['MY_TOKEN'])).toEqual([]);
    });

    test('a variable is interpolated only if another settings file names it', () => {
      const policy = hookPolicyOf([
        managed({ httpHookAllowedEnvVars: { MY_TOKEN: true } }),
        user({ httpHookAllowedEnvVars: ['MINE'] }),
      ]);
      expect(interpolated(policy, ['MY_TOKEN', 'MINE'])).toEqual(['MINE']);
    });

    test('an invalid entry is stripped and the rest enforced', () => {
      const raw = { httpHookAllowedEnvVars: ['MY_TOKEN', 5, false] };
      expect(issuesOf('managed', raw)).toHaveLength(2);
      expect(interpolated(hookPolicyOf([managed(raw)]), ['MY_TOKEN', 'OTHER'])).toEqual([
        'MY_TOKEN',
      ]);
    });

    test('in a user file a value that is not a list is dropped and limits nothing', () => {
      const policy = hookPolicyOf([user({ httpHookAllowedEnvVars: 'nope' })]);
      expect(interpolated(policy, ['ANY'])).toEqual(['ANY']);
    });
  });
});

describe('judgments on the variable list (the docs leave them open)', () => {
  test('a name repeated in the hook list or in the key is interpolated once', () => {
    const policy = hookPolicyOf([
      user({ httpHookAllowedEnvVars: ['A', 'A'] }),
      project({ httpHookAllowedEnvVars: ['A'] }),
    ]);
    expect(interpolated(policy, ['A', 'A'])).toEqual(['A']);
    expect(interpolated(hookPolicyOf([user({})]), ['A', 'A'])).toEqual(['A']);
  });

  test('a blocked URL interpolates nothing: the hook does not run', () => {
    const policy = hookPolicyOf([
      user({ allowedHttpHookUrls: ['https://other.test/*'], httpHookAllowedEnvVars: ['A'] }),
    ]);
    expect(policy.httpHook(url, ['A']).run).toBe(false);
  });
});
