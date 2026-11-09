import type {
  Command,
  CommandHead,
  InvocableHead,
  Skill,
  SkillHead,
} from '../../format/skill-types.ts';

/**
 * The skill or command without its body, field by field: the type system then proves nothing of the
 * body travels with it (a rest destructuring would also pass a field added to `Skill` later).
 */
function skillHead(skill: Skill): SkillHead {
  const { body: _body, ...head } = skill;
  return head;
}

function commandHead(command: Command): CommandHead {
  const { body: _body, ...head } = command;
  return head;
}

/** Whether the invocable is a skill: only a skill has a folder. */
const isSkillFile = (invocable: Skill | Command): invocable is Skill => 'dir' in invocable;

export const headOf = (invocable: Skill | Command): InvocableHead =>
  isSkillFile(invocable) ? skillHead(invocable) : commandHead(invocable);
