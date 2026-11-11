/** Helpers for tests of the permission session (`startPermissions`): the session in `/work/app` of the decide tests. */
import type {
  PermissionSessionInput,
  PermissionSession,
} from '../../src/host/permission-session.ts';
import { startPermissions } from '../../src/host/permission-session.ts';
import type { PermissionsPolicy, StartInput } from '../../src/settings/index.ts';
import { matchContext } from './rule-context.ts';
import { terminal } from './permissions-policy.ts';

/** The session the policy and the launch make; the test fails when the start is refused. */
export function sessionOf(
  policy: PermissionsPolicy,
  start: StartInput = terminal(),
  extra: Partial<PermissionSessionInput> = {},
): PermissionSession {
  const started = startPermissions({ policy, start, paths: matchContext.paths, ...extra });
  if (started.outcome === 'refused') throw new Error(`refused: ${started.reason}`);
  return started;
}
