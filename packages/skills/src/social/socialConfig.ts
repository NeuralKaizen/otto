export interface SocialMetricsConfig {
  enabled: boolean;
  zernioEnabled: boolean;
  zernioApiKey?: string;
  zernioBaseUrl: string;
  zernioReadOnlyMode: boolean;
  zernioFallbackToMock: boolean;
  zernioDefaultLimit: number;
}

export type SocialRuntimeMode = "zernio" | "mock" | "unavailable";

export interface SocialConfigStatus {
  enabled: boolean;
  zernioEnabled: boolean;
  zernioConfigured: boolean;
  canUseZernio: boolean;
  mockFallbackEnabled: boolean;
  mode: SocialRuntimeMode;
  zernioReadOnly: boolean;
  warnings: string[];
}

export interface SocialRuntimeState {
  lastKnownMode?: SocialRuntimeMode;
  warnings: string[];
  checkedAt?: string;
}

let socialRuntimeState: SocialRuntimeState = {
  warnings: [],
};

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

/**
 * Parses a boolean env var, normalizing whitespace and case.
 * Accepts: true/false, 1/0, yes/no (case-insensitive, trimmed).
 * Returns defaultValue when the var is unset, empty, or unrecognized.
 */
export function parseEnvBoolean(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === "") return defaultValue;
  const t = raw.trim().toLowerCase();
  if (t === "true" || t === "1" || t === "yes") return true;
  if (t === "false" || t === "0" || t === "no") return false;
  return defaultValue;
}

export function getSocialConfig(): SocialMetricsConfig {
  const rawDefaultLimit = env("ZERNIO_DEFAULT_LIMIT");
  return {
    enabled: parseEnvBoolean("ENABLE_SOCIAL_METRICS", true),
    zernioEnabled: parseEnvBoolean("ENABLE_ZERNIO", false),
    zernioApiKey: env("ZERNIO_API_KEY"),
    zernioBaseUrl: (env("ZERNIO_BASE_URL") ?? "https://zernio.com/api/v1").replace(/\/+$/, ""),
    zernioReadOnlyMode: parseEnvBoolean("ZERNIO_READ_ONLY_MODE", true),
    zernioFallbackToMock: parseEnvBoolean("ZERNIO_FALLBACK_TO_MOCK", true),
    zernioDefaultLimit: parsePositiveInt(rawDefaultLimit, 10),
  };
}

export function isZernioRealAdapterAvailable(config: SocialMetricsConfig = getSocialConfig()): boolean {
  return config.enabled && config.zernioEnabled && Boolean(config.zernioApiKey);
}

export function validateSocialConfig(config: SocialMetricsConfig = getSocialConfig()): SocialConfigStatus {
  const warnings: string[] = [];
  const zernioConfigured = Boolean(config.zernioApiKey);
  const baseUrlValid = /^https?:\/\/.+/i.test(config.zernioBaseUrl);
  const rawDefaultLimit = env("ZERNIO_DEFAULT_LIMIT");

  if (!config.enabled) {
    warnings.push("Social metrics está desactivado (ENABLE_SOCIAL_METRICS=false).");
  }

  if (!config.zernioEnabled) {
    const rawZernio = process.env.ENABLE_ZERNIO?.trim();
    if (rawZernio && !["false", "0", "no"].includes(rawZernio.toLowerCase())) {
      warnings.push(
        `Zernio no pudo activarse: ENABLE_ZERNIO="${rawZernio}" no es un valor booleano reconocido. ` +
        "Usa ENABLE_ZERNIO=true para activarlo."
      );
    } else {
      warnings.push("Zernio está desactivado. Para activarlo, configura ENABLE_ZERNIO=true en .env.");
    }
  }

  if (config.zernioEnabled && !config.zernioApiKey) {
    warnings.push("Falta ZERNIO_API_KEY; se usará mock si el fallback está activo (ZERNIO_FALLBACK_TO_MOCK=true).");
  }

  if (!baseUrlValid) {
    warnings.push("ZERNIO_BASE_URL no parece una URL HTTP válida (debe empezar con http:// o https://).");
  }

  if (
    rawDefaultLimit !== undefined &&
    (!Number.isFinite(Number(rawDefaultLimit)) || Number(rawDefaultLimit) <= 0)
  ) {
    warnings.push("ZERNIO_DEFAULT_LIMIT debe ser un entero mayor que cero.");
  }

  if (config.zernioEnabled && config.zernioApiKey && config.zernioFallbackToMock) {
    // Info-level: fallback is active even though Zernio is configured
    // (not a warning per se but useful for debugging)
  }

  if (config.zernioEnabled && config.zernioApiKey && config.zernioReadOnlyMode) {
    warnings.push("Zernio está en modo solo lectura (ZERNIO_READ_ONLY_MODE=true). Las acciones de escritura estarán bloqueadas.");
  }

  const canUseZernio = config.enabled && config.zernioEnabled && zernioConfigured && baseUrlValid;

  return {
    enabled: config.enabled,
    zernioEnabled: config.zernioEnabled,
    zernioConfigured,
    canUseZernio,
    mockFallbackEnabled: config.zernioFallbackToMock,
    mode: canUseZernio ? "zernio" : config.zernioFallbackToMock ? "mock" : "unavailable",
    zernioReadOnly: config.zernioReadOnlyMode,
    warnings,
  };
}

export function setSocialRuntimeState(mode: SocialRuntimeMode, warnings: string[] = []): void {
  socialRuntimeState = {
    lastKnownMode: mode,
    warnings: [...warnings],
    checkedAt: new Date().toISOString(),
  };
}

export function getSocialRuntimeState(): SocialRuntimeState {
  return {
    lastKnownMode: socialRuntimeState.lastKnownMode,
    warnings: [...socialRuntimeState.warnings],
    checkedAt: socialRuntimeState.checkedAt,
  };
}

export function resetSocialRuntimeState(): void {
  socialRuntimeState = { warnings: [] };
}
