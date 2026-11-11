import { CONTROL_OR_BIDI, nameValidationIssues, type NameContext } from '../names.ts';
import { errorAt, type Finding } from './finding.ts';

/**
 * The checks of `claude plugin validate` on a manifest's `name` (oracle 2.1.319): an empty name, a
 * space, a control or bidirectional-formatting character are errors and the only report; any
 * other name gets the reserved-name and kebab-case advice, which comes after the schema passes.
 */
const KEBAB_EXAMPLE = '"my-plugin"';

/** The errors that stop the advice, as the oracle words them. */
const BLOCKING: ReadonlyArray<readonly [broken: (name: string) => boolean, message: string]> = [
  [(name) => name === '', 'Plugin name cannot be empty'],
  [
    (name) => name.includes(' '),
    `Plugin name cannot contain spaces. Use kebab-case (e.g., ${KEBAB_EXAMPLE})`,
  ],
  [
    (name) => CONTROL_OR_BIDI.test(name),
    'Plugin name cannot contain control or bidirectional-formatting characters',
  ],
];

export interface NameOptions {
  /** An official marketplace lists this plugin: its name is not checked against the reserved ones. */
  readonly official?: boolean;
  /** Where the manifest is read: a marketplace entry's gets the shorter advice. Default the plugin's own file. */
  readonly context?: NameContext;
}

export interface NameFindings {
  readonly blocking: readonly Finding[];
  readonly advice: readonly Finding[];
}

/** `reported`: the marketplace entry carries this name and has already said what it thinks of it. */
export function nameFindings(name: string, options: NameOptions, reported: boolean): NameFindings {
  const first = BLOCKING.find(([broken]) => broken(name));
  if (first !== undefined) return { blocking: [errorAt('name', first[1])], advice: [] };
  const skipReserved = options.official === true || reported;
  const advice = nameValidationIssues(name, skipReserved, options.context).map((issue) => ({
    severity: issue.severity,
    path: 'name',
    message: issue.message,
  }));
  return { blocking: [], advice };
}
