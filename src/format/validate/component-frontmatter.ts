import { isRecord } from '../../protocol/is-record.ts';
import { parseFrontmatter, type Frontmatter, type FrontmatterState } from '../frontmatter.ts';
import { errorAt, warningAt, type Finding } from './finding.ts';
import { kindOf } from './received.ts';

/**
 * The frontmatter checks of `claude plugin validate` on a skill, agent or command file (oracle
 * 2.1.319): no block, a block that does not parse, a block that is not a mapping, a missing
 * description and the few fields whose type it reads. Anything else in the block is left alone.
 */
export const COMPONENT_KINDS = ['skill', 'agent', 'command'] as const;
export type ComponentKind = (typeof COMPONENT_KINDS)[number];

const EMPTY_METADATA = 'empty metadata (all frontmatter fields silently dropped).';
/** What a block that does not parse costs at runtime, by kind. */
const WHEN_UNPARSED: { readonly [K in ComponentKind]: string } = {
  skill: EMPTY_METADATA,
  agent: 'its name taken from the filename and every other frontmatter field silently dropped.',
  command: EMPTY_METADATA,
};

const NO_BLOCK =
  'No frontmatter block found. Add YAML frontmatter between --- delimiters at the top of the file to set description and other metadata.';

/**
 * The parser's complaint, in the validator's words. The validator's YAML parser names two causes;
 * this one (`yaml`) names more, so only an unterminated quote is told apart (spec/judgments.md).
 */
const yamlComplaint = (problem: string | undefined): string =>
  /missing closing/i.test(problem ?? '') ? 'Unexpected EOF' : 'Unexpected token';

const sentence = (value: unknown): string => (Array.isArray(value) ? 'an array' : kindOf(value));

/** The fields whose type the validator reads, each with how it words a wrong one. */
function fieldFindings(kind: ComponentKind, fields: Readonly<Record<string, unknown>>): Finding[] {
  const found: Finding[] = [];
  const name = present(fields.name);
  const metadata = present(fields.metadata);
  const tools = present(fields['allowed-tools']);
  if (name !== undefined && typeof name !== 'string') {
    found.push(errorAt('name', `name must be a string, got ${kindOf(name)}.`));
  }
  if (tools !== undefined && !isToolList(tools)) {
    found.push(
      errorAt(
        'allowed-tools',
        `allowed-tools must be a string or array of strings, got ${kindOf(tools)}.`,
      ),
    );
  }
  if (kind === 'skill' && metadata !== undefined && !isRecord(metadata)) {
    found.push(
      warningAt(
        'metadata',
        `'metadata' must be a mapping (key: value pairs); got ${kindOf(metadata)}. It is dropped at load time.`,
      ),
    );
  }
  if (fields.description === undefined) {
    found.push(
      warningAt(
        'description',
        `No description in frontmatter. A description helps users and Claude understand when to use this ${kind}.`,
      ),
    );
  }
  return found;
}

/** A key written with no value (`allowed-tools:`) is null: the validator treats it as absent. */
const present = (value: unknown): unknown => (value === null ? undefined : value);

const isToolList = (value: unknown): boolean =>
  typeof value === 'string' ||
  (Array.isArray(value) && value.every((entry) => typeof entry === 'string'));

/** What each state of the block gives: the missing block is advised on, a broken one is an error. */
const BLOCKS: {
  readonly [S in FrontmatterState]: (block: Frontmatter, kind: ComponentKind) => Finding[];
} = {
  none: () => [warningAt('frontmatter', NO_BLOCK)],
  ok: (block, kind) => fieldFindings(kind, block.fields),
  'invalid-yaml': (block, kind) => [
    errorAt(
      'frontmatter',
      `YAML frontmatter failed to parse: YAML Parse error: ${yamlComplaint(block.problem)}. At runtime this ${kind} loads with ${WHEN_UNPARSED[kind]}`,
    ),
  ],
  'not-a-table': (block) => [
    errorAt(
      'frontmatter',
      `Frontmatter must be a YAML mapping (key: value pairs), got ${sentence(block.value)}.`,
    ),
  ],
};

/** Findings of one component file's text, with the paths the oracle gives them. */
export function frontmatterFindings(kind: ComponentKind, text: string): Finding[] {
  const block = parseFrontmatter(text);
  return BLOCKS[block.state](block, kind);
}
