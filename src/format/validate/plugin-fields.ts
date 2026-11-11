import { z } from 'zod';
import { errorAt, warningAt, type Finding } from './finding.ts';
import { inlineServersValid } from './mcp-check.ts';
import { isPathKey, PATH_SHAPES, pathShapeFindings } from './plugin-paths.ts';
import { kindOf } from './received.ts';
import { zodFindings } from './zod-findings.ts';
import { isRecord } from '../../protocol/is-record.ts';
import { USER_CONFIG_KEY } from '../user-config-refs.ts';
import { userConfigOptionSchema } from '../manifest-schema.ts';

/**
 * The type rules of `plugin.json` as `claude plugin validate` applies them (oracle 2.1.319): one
 * check per key, in the order the validator reports them. A key with no entry here is either a
 * path key (`plugin-paths.ts`), a listing field the validator reads no further, or unknown.
 */
const text = z.string();
const flag = z.boolean();

/** One option rule set for loading and the validator (manifest-reference.md, "User configuration"). */
const userConfig = z.record(z.string().regex(USER_CONFIG_KEY), userConfigOptionSchema);

const SCHEMAS = {
  name: text,
  displayName: text,
  $schema: text,
  version: text,
  description: text,
  author: z.object({ name: text, email: text.optional(), url: text.optional() }),
  homepage: z.url(),
  repository: text,
  license: text,
  keywords: z.array(text),
  defaultEnabled: flag,
  dependencies: z.array(z.union([text, z.looseObject({ name: text })])),
  channels: z.array(
    z.object({ server: text, displayName: text.optional(), userConfig: userConfig.optional() }),
  ),
  settings: z.record(text, z.unknown()),
  userConfig,
} as const;
type SchemaKey = keyof typeof SCHEMAS;
const isSchemaKey = (key: string): key is SchemaKey => Object.hasOwn(SCHEMAS, key);

/** The order the oracle reports keys in: the schema's own. */
const ORDER = [
  'name',
  'displayName',
  '$schema',
  'version',
  'description',
  'author',
  'homepage',
  'repository',
  'license',
  'keywords',
  'defaultEnabled',
  'dependencies',
  'hooks',
  'commands',
  'agents',
  'skills',
  'outputStyles',
  'workflows',
  'themes',
  'monitors',
  'types',
  'channels',
  'mcpServers',
  'lspServers',
  'settings',
  'userConfig',
] as const;

/** Keys the validator accepts without reading their value. */
const UNREAD = [
  'metadata',
  'experimental',
  'capabilities',
  'icon',
  'documentationUrl',
  'supportUrl',
  'privacyPolicyUrl',
  'termsOfServiceUrl',
  'bugs',
  'support',
  'privacy_policy',
  'privacyPolicy',
  'terms_of_service',
  'screenshots',
  'docs',
] as const;

/** Every key a manifest may carry without an unknown-field warning. */
export const PLUGIN_KEYS: readonly string[] = [...ORDER, ...UNREAD];

/** The keys a misspelt one is compared with: those the validator reads, not those it only lets through. */
export const SUGGESTED_KEYS: readonly string[] = ORDER;

function keyFindings(key: (typeof ORDER)[number], value: unknown): Finding[] {
  if (isSchemaKey(key)) return zodFindings(SCHEMAS[key].safeParse(value), key);
  if (key === 'mcpServers' && isRecord(value) && !inlineServersValid(value)) {
    return [errorAt('mcpServers', 'Invalid input')];
  }
  return isPathKey(key) ? pathShapeFindings(key, PATH_SHAPES[key], value) : [];
}

/** The type errors of the keys present, in the validator's order. */
export function fieldFindings(manifest: Readonly<Record<string, unknown>>): Finding[] {
  return ORDER.flatMap((key) =>
    Object.hasOwn(manifest, key) && manifest[key] !== undefined
      ? keyFindings(key, manifest[key])
      : [],
  );
}

/** `name` is the one key a manifest cannot do without. */
export function missingName(manifest: Readonly<Record<string, unknown>>): Finding[] {
  return Object.hasOwn(manifest, 'name')
    ? []
    : [errorAt('name', 'Invalid input: expected string, received undefined')];
}

const NOT_AN_OBJECT = (key: string, what: string, outcome: string, value: unknown): Finding =>
  warningAt(
    key,
    `'${key}' must be ${what}; got ${kindOf(value)}. It will be ${outcome} at load time.`,
  );

/** The free-form `metadata` and the `experimental` block: a wrong type is only a warning. */
export function looseObjectFindings(manifest: Readonly<Record<string, unknown>>): Finding[] {
  const found: Finding[] = [];
  const { metadata, experimental } = manifest;
  if (metadata !== undefined && !isRecord(metadata)) {
    found.push(NOT_AN_OBJECT('metadata', 'a free-form object', 'ignored', metadata));
  }
  if (experimental !== undefined && !isRecord(experimental)) {
    found.push(
      NOT_AN_OBJECT(
        'experimental',
        'an object containing component declarations',
        'ignored',
        experimental,
      ),
    );
  }
  return found;
}
