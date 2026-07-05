import type { SocialProfileMetrics, SocialPlatform, SocialMetricsResponse, SocialMetricsRequest } from "./types.js";
import type { SocialAdapter } from "./adapters/baseSocialAdapter.js";
import { SocialAdapterError } from "./adapters/baseSocialAdapter.js";
import { mockInstagramAdapter, mockTikTokAdapter, mockYouTubeAdapter } from "./adapters/mockSocialAdapter.js";
import { zernioInstagramAdapter, zernioTikTokAdapter, zernioYouTubeAdapter } from "./adapters/zernioAdapter.js";
import { generateInsights } from "./analysis/generateInsights.js";
import {
  getSocialConfig,
  isZernioRealAdapterAvailable,
  setSocialRuntimeState,
  validateSocialConfig,
} from "./socialConfig.js";

const ZERNIO_ADAPTERS: Record<Exclude<SocialPlatform, "all">, SocialAdapter> = {
  instagram: zernioInstagramAdapter,
  tiktok: zernioTikTokAdapter,
  youtube: zernioYouTubeAdapter,
};

const MOCK_ADAPTERS: Record<Exclude<SocialPlatform, "all">, SocialAdapter> = {
  instagram: mockInstagramAdapter,
  tiktok: mockTikTokAdapter,
  youtube: mockYouTubeAdapter,
};

function createUnavailableProfile(
  platform: Exclude<SocialPlatform, "all">,
  username: string,
  reason: string
): SocialProfileMetrics {
  return {
    platform,
    username,
    lastUpdated: new Date().toISOString(),
    dataSource: "unavailable",
    isRealData: false,
    isMock: false,
    warnings: [reason],
    limitations: [reason],
  };
}

function getConfigMockReason(): string | null {
  const status = validateSocialConfig(getSocialConfig());
  return status.canUseZernio ? null : status.warnings[0] ?? null;
}

function addMockFallbackContext(profile: SocialProfileMetrics, reason: string): SocialProfileMetrics {
  const warnings = [reason, ...profile.warnings];
  return {
    ...profile,
    warnings,
    limitations: warnings,
  };
}

async function fetchMockProfile(
  platform: Exclude<SocialPlatform, "all">,
  username: string,
  reason: string
): Promise<SocialProfileMetrics> {
  const mockProfile = await MOCK_ADAPTERS[platform].fetchProfileMetrics(username);
  return addMockFallbackContext(mockProfile, reason);
}

async function fetchOne(
  platform: Exclude<SocialPlatform, "all">,
  username: string
): Promise<{ profile: SocialProfileMetrics; unavailable: { platform: string; reason: string } | null }> {
  const config = getSocialConfig();
  const mockReason = getConfigMockReason();

  if (mockReason) {
    return {
      profile: await fetchMockProfile(platform, username, mockReason),
      unavailable: null,
    };
  }

  try {
    const adapter = ZERNIO_ADAPTERS[platform];
    if (!isZernioRealAdapterAvailable(config) || !adapter.isAvailable()) {
      return {
        profile: await fetchMockProfile(platform, username, "Zernio no está disponible para esta instancia, usando mock."),
        unavailable: null,
      };
    }

    const profile = await adapter.fetchProfileMetrics(username);
    return { profile, unavailable: null };
  } catch (err) {
    const parsed = err instanceof SocialAdapterError
      ? err
      : new SocialAdapterError(String(err), { code: "social_unknown_error", recoverable: true });

    if (parsed.recoverable && config.zernioFallbackToMock) {
      return {
        profile: await fetchMockProfile(
          platform,
          username,
          `No se pudo obtener data real desde Zernio para ${platform}: ${parsed.message}. Se devuelve mock seguro.`
        ),
        unavailable: null,
      };
    }

    return {
      profile: createUnavailableProfile(platform, username, parsed.message),
      unavailable: {
        platform,
        reason: parsed.message,
      },
    };
  }
}

export async function routePlatformRequest(request: SocialMetricsRequest): Promise<SocialMetricsResponse> {
  const config = getSocialConfig();
  const configStatus = validateSocialConfig(config);
  const platforms: Exclude<SocialPlatform, "all">[] =
    request.platform === "all" ? ["instagram", "tiktok", "youtube"] : [request.platform];

  const profiles: SocialProfileMetrics[] = [];
  const unavailable: { platform: string; reason: string }[] = [];

  for (const platform of platforms) {
    const result = await fetchOne(platform, request.username);
    profiles.push(result.profile);
    if (result.unavailable) {
      unavailable.push(result.unavailable);
    }
  }

  const { insights, recommendations } = generateInsights(profiles);

  const realCount = profiles.filter((p) => p.isRealData).length;
  const mockCount = profiles.filter((p) => p.dataSource === "mock").length;
  const unavailableCount = profiles.filter((p) => p.dataSource === "unavailable").length;
  const primaryReason = profiles[0]?.limitations[0];
  const warnings = Array.from(
    new Set([
      ...configStatus.warnings,
      ...profiles.flatMap((profile) => profile.warnings),
      ...unavailable.map((item) => item.reason),
    ])
  );

  let summary: string;
  if (realCount === 0 && mockCount === 0 && unavailableCount === 0) {
    summary = `No se pudieron obtener métricas para @${request.username}.`;
  } else if (realCount > 0 && mockCount === 0 && unavailableCount === 0) {
    summary = `Métricas reales de @${request.username} en ${profiles.map((p) => p.platform).join(", ")}.`;
  } else if (mockCount > 0 && realCount === 0 && unavailableCount === 0) {
    summary = primaryReason
      ? `Métricas simuladas (mock) de @${request.username}. Motivo: ${primaryReason}`
      : `Métricas simuladas (mock) de @${request.username}.`;
  } else if (unavailableCount > 0 && realCount === 0 && mockCount === 0) {
    summary = primaryReason
      ? `No hay métricas reales disponibles para @${request.username}. Motivo: ${primaryReason}`
      : `No hay métricas reales disponibles para @${request.username}. Esta consulta requiere una cuenta conectada en Zernio o un plan con Analytics.`;
  } else {
    summary = `Métricas de @${request.username}: ${realCount} plataforma(s) con datos reales, ${mockCount} con datos simulados y ${unavailableCount} no disponible(s).`;
  }

  const responseDataSource = realCount > 0 ? "zernio" : mockCount > 0 ? "mock" : "unavailable";
  setSocialRuntimeState(responseDataSource, warnings);

  if (!config.enabled) {
    setSocialRuntimeState("unavailable", warnings);
  } else if (!configStatus.canUseZernio && config.zernioFallbackToMock) {
    setSocialRuntimeState("mock", warnings);
  }

  return {
    request,
    profiles,
    summary,
    insights,
    recommendations,
    dataSource: responseDataSource,
    isMock: responseDataSource === "mock",
    warnings,
    unavailable,
  };
}
