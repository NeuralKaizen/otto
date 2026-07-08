import type { FastifyInstance } from "fastify";
import { getProviderInfo } from "@wattson/agent-core";
import {
  getSocialRuntimeState,
  isNotionComposioQueryAvailable,
  getComposioConfig,
  isComposioRealAdapterAvailable,
  getSocialConfig,
  isZernioRealAdapterAvailable,
  validateSocialConfig,
  getNotionWorkspaceConfig,
  getNotionRuntimeState,
  validateNotionWorkspaceConfig,
  discoverNotionActionSupport,
} from "@wattson/skills";
import { env } from "../env.js";
import { clientCount } from "../ws/eventBus.js";

export function healthRoutes(app: FastifyInstance): void {
  app.get("/health", async (_req, reply) => {
    const providerInfo = getProviderInfo();
    const enableStreaming = process.env.ENABLE_STREAMING !== "false";
    const composioConfig = getComposioConfig();
    const socialConfig = getSocialConfig();
    const socialStatus = validateSocialConfig(socialConfig);
    const socialRuntime = getSocialRuntimeState();
    const notionConfig = getNotionWorkspaceConfig();
    const notionStatus = validateNotionWorkspaceConfig(notionConfig);
    const notionRuntime = getNotionRuntimeState();
    const notionDiscovery = await discoverNotionActionSupport(notionConfig);
    const socialWarnings = Array.from(
      new Set([
        ...socialStatus.warnings,
        ...socialRuntime.warnings,
      ])
    );
    const notionWarnings = Array.from(new Set([
      ...notionStatus.warnings,
      ...notionRuntime.warnings,
      ...notionDiscovery.warnings,
    ]));
    const notionCanSearch = notionStatus.enabled &&
      notionStatus.configured &&
      notionDiscovery.notionConnected === true &&
      (notionDiscovery.actionValidation.search === true || notionDiscovery.actionValidation.queryDatabase === true);
    const notionCanCreatePage = notionStatus.enabled &&
      notionStatus.configured &&
      notionStatus.defaultParentConfigured &&
      !notionStatus.readOnlyMode &&
      notionDiscovery.notionConnected === true &&
      notionDiscovery.actionValidation.createPage === true;
    const notionCanCreateTask = notionStatus.enabled &&
      notionStatus.configured &&
      notionStatus.tasksDatabaseConfigured &&
      !notionStatus.readOnlyMode &&
      notionDiscovery.notionConnected === true &&
      notionDiscovery.actionValidation.createDatabaseItem === true;

    reply.send({
      ok: true,
      service: "wattson-api",
      wsClients: clientCount(),
      provider: {
        ...providerInfo,
        streamingSupported: true,
      },
      features: {
        websocketStreaming: enableStreaming,
        approvals: process.env.ENABLE_APPROVALS !== "false",
        voice: process.env.ENABLE_VOICE === "true",
        socialMetrics: process.env.ENABLE_SOCIAL_METRICS !== "false",
        zernioEnabled: socialConfig.zernioEnabled,
        zernioConfigured: socialConfig.zernioEnabled && Boolean(socialConfig.zernioApiKey),
        zernioMode: isZernioRealAdapterAvailable(socialConfig) ? "real" : "mock",
        zernioFallbackToMock: socialConfig.zernioFallbackToMock,
        zernioReadOnly: socialConfig.zernioReadOnlyMode,
        notionProjectIntelligence: env.ENABLE_NOTION,
        notionEnabled: notionStatus.enabled,
        notionComposioAvailable: isNotionComposioQueryAvailable(),
        notionDedicatedSkill: true,
        notionProvider: notionStatus.provider,
        notionMode: notionRuntime.lastKnownMode ?? (notionStatus.configured ? "real" : notionConfig.fallbackToMock ? "mock" : "unavailable"),
        notionReadOnly: notionStatus.readOnlyMode,
        notionCanSearch,
        notionCanCreatePage,
        notionCanCreateTask,
        youtubeRealMetrics: process.env.ENABLE_YOUTUBE_REAL_METRICS === "true" && Boolean(process.env.YOUTUBE_API_KEY),
        instagramRealMetrics: process.env.ENABLE_INSTAGRAM_REAL_METRICS === "true" && Boolean(process.env.INSTAGRAM_ACCESS_TOKEN),
        tiktokRealMetrics: process.env.ENABLE_TIKTOK_REAL_METRICS === "true" && Boolean(process.env.TIKTOK_ACCESS_TOKEN),
        composioGateway: true,
        composioEnabled: composioConfig.enabled,
        composioMode: isComposioRealAdapterAvailable(composioConfig) ? "real" : "mock",
        composioReadOnly: composioConfig.readOnly,
        composioAllowedToolkits: composioConfig.allowedToolkits,
        composioApprovalFlow: true,
      },
      social: {
        enabled: socialStatus.enabled,
        zernioEnabled: socialStatus.zernioEnabled,
        zernioConfigured: socialStatus.zernioConfigured,
        mockFallbackEnabled: socialStatus.mockFallbackEnabled,
        canUseZernio: socialStatus.canUseZernio,
        configuredMode: socialStatus.mode,
        zernioReadOnly: socialStatus.zernioReadOnly,
        lastKnownMode: socialRuntime.lastKnownMode,
        warnings: socialWarnings,
        checkedAt: socialRuntime.checkedAt,
      },
      notion: {
        enabled: notionStatus.enabled,
        provider: notionStatus.provider,
        configured: notionStatus.configured,
        composioConfigured: notionStatus.composioConfigured,
        userIdPresent: notionStatus.userIdPresent,
        defaultParentConfigured: notionStatus.defaultParentConfigured,
        tasksDatabaseConfigured: notionStatus.tasksDatabaseConfigured,
        readOnlyMode: notionStatus.readOnlyMode,
        requireApproval: notionStatus.requireApproval,
        canSearch: notionCanSearch,
        canCreatePage: notionCanCreatePage,
        canCreateTask: notionCanCreateTask,
        notionConnected: notionDiscovery.notionConnected,
        actionValidation: notionDiscovery.actionValidation,
        validatedSlugs: notionDiscovery.foundSlugs,
        missingSlugs: notionDiscovery.missingSlugs,
        lastKnownMode: notionRuntime.lastKnownMode ?? null,
        warnings: notionWarnings,
        checkedAt: notionRuntime.checkedAt ?? null,
      },
      timestamp: new Date().toISOString(),
    });
  });
}
