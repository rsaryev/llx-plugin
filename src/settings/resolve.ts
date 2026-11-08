import type { PluginIssue } from '../format/issues.ts';
import type { PolicyContext } from './context.ts';
import { createChannelSettingsPolicy, type ChannelSettingsPolicy } from './channels/policy.ts';
import { createCustomizationPolicy, type CustomizationPolicy } from './customization/policy.ts';
import { createHookPolicy, type HookPolicy } from './hooks/policy.ts';
import { applyParentRules } from './hooks/parent-settings.ts';
import type { PolicyLayer } from './layers.ts';
import type { ManagedComposition } from './managed/compose.ts';
import {
  createCommandSourcePolicy,
  type CommandSourcePolicy,
} from './marketplaces/command-sources.ts';
import { createMcpSettingsPolicy, type McpSettingsPolicy } from './mcp/policy.ts';
import { createMarketplaceGate, type MarketplaceGate } from './marketplaces/gate.ts';
import { createMarketplaceRegistry, type MarketplaceRegistry } from './marketplaces/registry.ts';
import { createPermissionsPolicy, type PermissionsPolicy } from './permissions/index.ts';
import { createPluginSettingsPolicy, type PluginSettingsPolicy } from './plugins/policy.ts';
import { createSkillSettingsPolicy, type SkillSettingsPolicy } from './skills/policy.ts';
import { createPolicyView, type PolicyView } from './view.ts';
import { createWorkflowSettingsPolicy, type WorkflowSettingsPolicy } from './workflows/policy.ts';

/** The marketplace keys behind one object: the two lists, the registry plan and the command sources. */
export interface MarketplaceSettingsPolicy {
  readonly gate: MarketplaceGate;
  readonly registry: MarketplaceRegistry;
  readonly commandSources: CommandSourcePolicy;
}

export interface ResolvedPolicy {
  /** The layers as one view, for a key this policy has no area for. */
  readonly view: PolicyView;
  readonly plugins: PluginSettingsPolicy;
  readonly marketplaces: MarketplaceSettingsPolicy;
  readonly hooks: HookPolicy;
  readonly skills: SkillSettingsPolicy;
  readonly workflows: WorkflowSettingsPolicy;
  readonly channels: ChannelSettingsPolicy;
  readonly customization: CustomizationPolicy;
  readonly mcp: McpSettingsPolicy;
  readonly permissions: PermissionsPolicy;
  /** What reading the files said, then what the marketplace registry refused. */
  readonly issues: readonly PluginIssue[];
}

export interface ResolveInput {
  readonly layers: readonly PolicyLayer[];
  readonly context: PolicyContext;
  /** The issues `readSettingsLayer` returned for those layers, carried through to `issues`. */
  readonly issues?: readonly PluginIssue[];
  /**
   * The layers of the device's own managed sources (an MDM plist, an HKLM registry key, a system
   * `managed-settings.json`): `allowClaudeInChromeWithManagedMcp` is read from these only.
   */
  readonly deviceManaged?: readonly PolicyLayer[];
  /**
   * The managed tier the kit composed from the machine's managed sources (`composeManaged`): whether an
   * administrator deploys managed settings and whether parent settings merge come from it, not from
   * `context`.
   */
  readonly managed?: ManagedComposition;
}

function marketplacesOf(view: PolicyView, context: PolicyContext): MarketplaceSettingsPolicy {
  const gate = createMarketplaceGate(view);
  return {
    gate,
    registry: createMarketplaceRegistry(view, {
      isFolderTrusted: context.isFolderTrusted,
      officialMarketplaces: context.officialMarketplaces,
      check: (source) => gate.check(source),
    }),
    commandSources: createCommandSourcePolicy(view),
  };
}

/**
 * Every area of the settings policy over one set of layers, so a host builds the view once and each
 * area reads its keys through it. The parent settings an embedding host passes are dropped before any
 * area reads them where an administrator deploys managed settings without opting in (judgment: the
 * gateway page words this for hook and skill keys, the marketplace and customization keys follow it).
 * The `hooks` lock comes from the customization policy, so the two cannot disagree.
 */
export function resolvePolicy(input: ResolveInput): ResolvedPolicy {
  const { managed } = input;
  const context =
    managed === undefined
      ? input.context
      : {
          ...input.context,
          hasManagedSettings: managed.hasManagedSettings,
          parentMerge: managed.parentMerge,
        };
  const view = applyParentRules(createPolicyView(input.layers), context);
  const customization = createCustomizationPolicy(view, context);
  const marketplaces = marketplacesOf(view, context);
  return {
    view,
    plugins: createPluginSettingsPolicy(view, context),
    marketplaces,
    hooks: createHookPolicy(
      view,
      { hooks: customization.locked.has('hooks') },
      {
        ...context,
        folderTrusted: context.isFolderTrusted('project'),
      },
    ),
    skills: createSkillSettingsPolicy(view, context),
    workflows: createWorkflowSettingsPolicy(view, {
      ...context,
      configChoice: context.workflowSizeChoice,
    }),
    channels: createChannelSettingsPolicy(view, context),
    customization,
    mcp: createMcpSettingsPolicy(view, context, {
      pluginOnlyMcp: customization.locked.has('mcp'),
      deviceManaged: input.deviceManaged ?? [],
    }),
    permissions: createPermissionsPolicy(view, context),
    issues: [
      ...(input.issues ?? []),
      ...marketplaces.registry.registrations().flatMap((each) => each.issues),
    ],
  };
}
