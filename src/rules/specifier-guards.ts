import type { Specifier } from './types.ts';

type OfForm<F extends Specifier['form']> = Extract<Specifier, { readonly form: F }>;

/** A guard for one form of specifier, so a matcher names what it reads and never repeats the literal (K2). */
const isForm =
  <F extends Specifier['form']>(form: F) =>
  (specifier: Specifier | undefined): specifier is OfForm<F> =>
    specifier?.form === form;

/** `Agent(Explore)`, `Skill(commit *)`: a name or pattern in the tool's own format. */
export const isTextSpecifier = isForm('text');

/** `WebFetch(domain:example.com)`: a domain pattern. */
export const isDomainSpecifier = isForm('domain');
