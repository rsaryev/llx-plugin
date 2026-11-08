import { callback, firstProblem, textOf, type ElementDef } from './def.ts';

/** `Markdown` "takes its content in a `text` prop, not in `children`, and needs a `key` when you pass `onLinkPress`". */
export const MARKDOWN: ElementDef = {
  name: 'Markdown',
  props: ['text', 'key', 'dimColor', 'onLinkPress', 'pressableLinks'],
  children: 'none',
  check: (props) =>
    firstProblem(
      textOf('Markdown', props, 'text'),
      callback('Markdown', props, 'onLinkPress'),
      props.onLinkPress !== undefined && (typeof props.key !== 'string' || props.key === '')
        ? 'Markdown prop "onLinkPress" needs a key'
        : undefined,
    ),
};
