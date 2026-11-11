import { catalogAgentOf, type CatalogAgent } from '../../agents/catalog/index.ts';
import { readAgent } from '../../format/agent.ts';
import type { AgentFolderScope } from '../../agents/catalog/types.ts';
import { pluginNameOf } from '../../format/marketplace/ids.ts';
import { readSkill } from '../../format/skill.ts';
import type { SkillOrigin } from '../../format/skill-types.ts';
import { catalogRows, type SessionSkill } from '../../host/session-skill-catalog.ts';
import type { SkillSource } from '../../host/session-skill-entries.ts';
import { SCOPE_RULES } from '../../skills/scan/locations.ts';

/**
 * Rows a host's own code takes, built the way a session builds them (docs/API.md, "Testing kit"):
 * a test of a host's skill list or agent picker gets a `SessionSkill` or a `CatalogAgent` without a
 * session, a disk or a scan. The frontmatter is read by the kit's own reader, so a row holds what a
 * file with that frontmatter would give.
 */

/** The frontmatter as YAML: each value written as JSON, which YAML reads as written. */
const frontmatterText = (fields: Readonly<Record<string, unknown>>, body: string): string =>
  `---\n${Object.entries(fields)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join('\n')}\n---\n${body}\n`;

const originOf = (source: SkillSource): SkillOrigin => {
  if ('pluginId' in source) return { kind: 'plugin', plugin: pluginNameOf(source.pluginId) };
  return 'scope' in source ? SCOPE_RULES[source.scope].origin : { kind: 'bundled' };
};

export interface SessionSkillFixture {
  /** The skill folder's name: the command, `<plugin>:<name>` for a plugin's skill. */
  readonly name: string;
  /** Frontmatter fields beyond `description`, under their own names (`allowed-tools`, `keywords`). */
  readonly frontmatter?: Readonly<Record<string, unknown>>;
  readonly description?: string;
  /** Where it came from; a personal skill (`{ kind: 'folder', scope: 'user' }`) by default. */
  readonly source?: SkillSource;
  readonly body?: string;
}

/**
 * A skill row as `skillCatalog()` lists it: on, with no `skillOverrides`, never dormant, answering
 * to its command alone. `file` is `<name>/SKILL.md`; the row has no `directory`, as a host skill.
 */
export function sessionSkillFixture(fixture: SessionSkillFixture): SessionSkill {
  const source = fixture.source ?? { kind: 'folder', scope: 'user' };
  const fields = { description: fixture.description ?? fixture.name, ...fixture.frontmatter };
  const path = `${fixture.name}/SKILL.md`;
  const text = frontmatterText(fields, fixture.body ?? `Run ${fixture.name}.`);
  const { body, ...invocable } = readSkill(path, text, {
    origin: originOf(source),
    dirName: fixture.name,
  }).skill;
  const [row] = catalogRows({
    entries: [
      {
        invocable,
        names: [invocable.command],
        readBody: () => Promise.resolve(body),
        source,
        file: path,
      },
    ],
    workflows: new Set(),
    overrides: undefined,
    activated: new Set(),
  });
  if (row === undefined) throw new Error(`no skill row for ${fixture.name}`);
  return row;
}

export interface CatalogAgentFixture {
  readonly name: string;
  readonly description?: string;
  /** Frontmatter fields beyond `name` and `description` (`tools`, `model`, `omitClaudeMd`). */
  readonly frontmatter?: Readonly<Record<string, unknown>>;
  /** A scope folder (`user` by default), or a plugin by the id the host uses for it. */
  readonly source?: AgentFolderScope | { readonly pluginId: string };
  /** The system prompt. */
  readonly body?: string;
}

/** An agent row as `agentCatalog()` lists it, read from `agents/<name>.md` of its source. */
export function catalogAgentFixture(fixture: CatalogAgentFixture): CatalogAgent {
  const source = fixture.source ?? 'user';
  const fields = {
    name: fixture.name,
    description: fixture.description ?? fixture.name,
    ...fixture.frontmatter,
  };
  const text = frontmatterText(fields, fixture.body ?? `You are ${fixture.name}.`);
  const path = `agents/${fixture.name}.md`;
  const read =
    typeof source === 'string'
      ? readAgent(text, { path, source })
      : readAgent(text, {
          path,
          source: 'plugin',
          plugin: { name: pluginNameOf(source.pluginId) },
        });
  if (read.agent === undefined) {
    throw new Error(`${fixture.name}: ${read.issues.map((one) => one.message).join('; ')}`);
  }
  return catalogAgentOf(read.agent, typeof source === 'string' ? undefined : source.pluginId);
}
