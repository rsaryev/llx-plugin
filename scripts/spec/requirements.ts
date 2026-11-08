import { join } from 'node:path';
import { z } from 'zod';
import { ROOT, pageUrl } from '../docs/location.ts';
import { CATEGORIES } from './sources.ts';

/** The committed list of requirements (docs/SPEC.md). */
export const REQUIREMENTS_FILE = join(ROOT, 'spec', 'requirements.json');

/** The sections the audit leaves out, each with its reason (docs/SPEC.md, "Sections and scope"). */
export const OUT_OF_SCOPE_FILE = join(ROOT, 'spec', 'out-of-scope.json');

const requirementSchema = z.strictObject({
  /** `<category path>.<key>`, such as `hooks.handler.common.timeout`. */
  id: z.string().min(1),
  category: z.enum(CATEGORIES),
  /** The docs page, relative to https://code.claude.com/docs/en/. */
  page: z.string().min(1),
  /** The heading the requirement sits under. */
  section: z.string(),
});
export type Requirement = z.infer<typeof requirementSchema>;

const fileSchema = z.strictObject({
  /** The Claude Code release the docs described when the list was extracted. */
  claudeCode: z.string(),
  requirements: z.array(requirementSchema),
});
export type RequirementsFile = z.infer<typeof fileSchema>;

export async function readRequirements(): Promise<RequirementsFile> {
  return fileSchema.parse(await Bun.file(REQUIREMENTS_FILE).json());
}

/** A citation for a requirement: its page's URL and section. */
export const citation = (requirement: Requirement): string =>
  `${pageUrl(requirement.page)} § ${requirement.section}`;
