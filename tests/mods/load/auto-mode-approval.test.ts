/** plugins/mods/admin.md § Know what happens by default: "A user's mod can still skip some prompts". */
import { expect, test } from 'bun:test';
import { modApprovalSkipsClassifier } from '../../../src/mods/load/index.ts';
import { spec } from '../../support/spec.ts';

spec("policy.mods.Know what happens by default.A user's mod can still skip some prompts", () => {
  test('in auto mode a call the mod approves runs without a classifier check', () => {
    expect(
      modApprovalSkipsClassifier({
        guardLoaded: false,
        permissionPromptTool: true,
        canUseTool: true,
      }),
    ).toBe(true);
    expect(
      modApprovalSkipsClassifier({
        guardLoaded: true,
        permissionPromptTool: false,
        canUseTool: false,
      }),
    ).toBe(true);
  });

  test('with the guard loaded and --permission-prompt-tool or canUseTool, the classifier checks first', () => {
    expect(
      modApprovalSkipsClassifier({
        guardLoaded: true,
        permissionPromptTool: true,
        canUseTool: false,
      }),
    ).toBe(false);
    expect(
      modApprovalSkipsClassifier({
        guardLoaded: true,
        permissionPromptTool: false,
        canUseTool: true,
      }),
    ).toBe(false);
  });
});
