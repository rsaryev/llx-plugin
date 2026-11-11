/**
 * The kit's own lint rules (AGENTS.md, rules K1 and K2), loaded by oxlint as a JS plugin.
 *
 * A closed set (a job's kind, a task's trigger, a state) is an `as const` array, its zod enum and
 * its union type. What differs per member is a strategy in one registry, a map typed over the
 * union (`{ [K in Kind]: Strategy<K> }`), and code asks the registry. So nothing branches on a
 * member by hand: a `switch` is never written, and a kind-like field is never compared to a
 * string. A new member then fails the typecheck wherever it needs a strategy, instead of falling
 * silently into an `else`.
 */

/** Fields that name a member of a closed set. */
const KIND_FIELDS = new Set([
  'kind',
  'type',
  'state',
  'status',
  'trigger',
  'outcome',
  'action',
  'target',
  'role',
  'tone',
  'mode',
  'phase',
  'reason',
  'category',
  'level',
  'layout',
  'frame',
  'preset',
  'purpose',
  'source',
  'by',
  'variant',
]);

const isString = (node) => node?.type === 'Literal' && typeof node.value === 'string';

/** `x.kind`, `x?.state`, `x['type']`: the field it reads, when it is a kind-like one. */
function kindField(node) {
  if (node?.type === 'ChainExpression') return kindField(node.expression);
  if (node?.type !== 'MemberExpression') return undefined;
  const name = node.computed
    ? isString(node.property)
      ? node.property.value
      : undefined
    : node.property.name;
  return KIND_FIELDS.has(name) ? name : undefined;
}

const noSwitch = {
  meta: {
    type: 'problem',
    docs: { description: 'Branch through a registry of strategies, never a switch (K1).' },
  },
  create(context) {
    return {
      SwitchStatement(node) {
        context.report({
          node,
          message:
            'No switch (K1): put what differs per member in a registry of strategies typed over the union, and call it.',
        });
      },
    };
  },
};

const noKindLiteral = {
  meta: {
    type: 'problem',
    docs: { description: 'Never compare a kind-like field to a string (K2).' },
  },
  create(context) {
    return {
      BinaryExpression(node) {
        if (!['===', '!==', '==', '!='].includes(node.operator)) return;
        const [field, literal] = isString(node.right)
          ? [kindField(node.left), node.right]
          : isString(node.left)
            ? [kindField(node.right), node.left]
            : [undefined, undefined];
        if (!field || !literal) return;
        context.report({
          node,
          message: `No \`${field} ${node.operator} '${literal.value}'\` (K2): ask the ${field}'s registry, or use a guard its module exports.`,
        });
      },
    };
  },
};

/**
 * A generic guard that takes the member as a string (`isRole(message, 'user')`,
 * `isItemOfKind(item, 'preview')`) is the same comparison under another name: the string is still
 * in the code, and the meaning is not. Ask the set's registry for what the member means instead
 * (`ROLES[message.role].fromPerson`).
 */
const MEMBER_GUARD =
  /^(is|in|has)\w*(Kind|Type|Typed|State|Status|Role|Category|Outcome|Trigger|Action|Member|Mode|Level|Source|Target)$|Of(Kind|Type)$/;

const calleeName = (callee) =>
  callee?.type === 'Identifier'
    ? callee.name
    : callee?.type === 'MemberExpression' && !callee.computed
      ? callee.property.name
      : undefined;

const noMemberGuard = {
  meta: {
    type: 'problem',
    docs: { description: 'Never pass a member to a generic guard as a string (K2).' },
  },
  create(context) {
    return {
      CallExpression(node) {
        const name = calleeName(node.callee);
        if (!name || !MEMBER_GUARD.test(name)) return;
        const literal = node.arguments.find(isString);
        if (!literal) return;
        context.report({
          node,
          message: `No \`${name}(…, '${literal.value}')\` (K2): a member passed as a string is a comparison in disguise; ask the set's registry what the member means.`,
        });
      },
    };
  },
};

// oxlint-disable-next-line import/no-default-export -- oxlint loads a JS plugin from its default export
export default {
  meta: { name: 'kit' },
  rules: {
    'no-switch': noSwitch,
    'no-kind-literal': noKindLiteral,
    'no-member-guard': noMemberGuard,
  },
};
