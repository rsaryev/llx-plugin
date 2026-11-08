/** Builders for the `plugin update` tests: installs with a version, an update subject, and what a run printed. */
import { planPluginUpdate, type UpdateRun } from '../../src/cli/update-plan.ts';
import type {
  UpdatableInstall,
  PluginUpdateArguments,
  PluginUpdateFacts,
} from '../../src/cli/update-facts.ts';
import { renderCommand } from '../../src/cli/result.ts';
import { realSha256 } from './install.ts';
import { fakeEnvironment } from './ports.ts';

/** An install whose marketplace now offers `offered`; `installed` is what `installed_plugins.json` records. */
export function install(
  id: string,
  versions: { readonly installed?: string; readonly offered: string },
  extra: Partial<UpdatableInstall> = {},
): UpdatableInstall {
  return {
    id,
    scope: 'user',
    ...(versions.installed === undefined ? {} : { installedVersion: versions.installed }),
    subject: { from: 'claude-ai', recordedVersion: versions.offered },
    dependencyInstall: 'complete',
    ...extra,
  };
}

export interface UpdateSetup {
  readonly args?: Partial<PluginUpdateArguments>;
  readonly installs: readonly UpdatableInstall[];
  readonly facts?: Partial<PluginUpdateFacts>;
  readonly env?: Record<string, string>;
}

export const update = (setup: UpdateSetup): Promise<UpdateRun> =>
  planPluginUpdate(
    { plugin: 'formatter@m', ...setup.args },
    {
      installs: setup.installs,
      catalog: 'catalog-v1',
      env: fakeEnvironment(setup.env),
      session: false,
      tty: false,
      ...setup.facts,
    },
    realSha256,
  );

export const shown = (found: UpdateRun, json = false) => {
  if (!('output' in found)) throw new Error('the update did not end');
  return renderCommand(found.output, { json, before: found.before });
};

export const outputOf = (found: UpdateRun) => ('output' in found ? found.output : undefined);
