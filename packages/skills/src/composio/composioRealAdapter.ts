import type { ComposioAdapter, ComposioToolkit, ComposioToolRequest, ComposioToolResult, ComposioToolResultError, ConnectedAccountsCheck } from "./types.js";
import { getComposioConfig, isComposioRealAdapterAvailable, type ComposioConfig } from "./composioConfig.js";
import { classifyActionRisk } from "./composioPolicy.js";
import { getComposioClient } from "./composioClient.js";

/**
 * Safe, structured logging for real Composio calls. Never logs API keys,
 * tokens, or full payloads — only the toolkit/action/source/outcome.
 */
function logComposioCall(entry: { toolkit: string; action: string; source: "composio_api" | "mock"; success: boolean; errorCode?: string }): void {
  const { toolkit, action, source, success, errorCode } = entry;
  const status = success ? "success" : "failure";
  const suffix = errorCode ? ` errorCode=${errorCode}` : "";
  console.log(`[composio] provider=composio toolkit=${toolkit} action=${action} source=${source} ${status}${suffix}`);
}

/**
 * Classifies an error thrown by `@composio/core` into a stable, user-facing
 * error code without depending on specific SDK error classes (which may
 * change between versions). Inspects only `message`/`code`/`statusCode` —
 * never logs the error's raw payload.
 */
function classifyError(err: unknown): ComposioToolResultError {
  if (err instanceof Error) {
    const code = (err as { code?: string }).code;
    const statusCode = (err as { statusCode?: number }).statusCode;
    const message = err.message.toLowerCase();

    if (code === "CONNECTED_ACCOUNT_NOT_FOUND" || message.includes("connected account") || message.includes("no connection")) {
      return { message: "No se encontró una cuenta conectada para este toolkit.", code: "connected_account_not_found", recoverable: true };
    }
    if (code === "TOOL_NOT_FOUND" || statusCode === 404) {
      return { message: "La acción solicitada no existe en Composio.", code: "tool_not_found", recoverable: true };
    }
    if (statusCode === 401 || statusCode === 403 || code?.toLowerCase().includes("auth")) {
      return { message: "Composio rechazó la API key (no autorizada).", code: "auth_error", recoverable: true };
    }
    if (statusCode === 429) {
      return { message: "Composio aplicó un límite de uso (rate limit). Intenta de nuevo más tarde.", code: "rate_limited", recoverable: true };
    }
    return { message: err.message, code: "composio_error", recoverable: true };
  }
  return { message: String(err), code: "unknown_error", recoverable: true };
}

/**
 * Calls Composio's hosted API via `@composio/core`. Used only when
 * ENABLE_COMPOSIO=true and COMPOSIO_API_KEY is set — otherwise
 * `composioMockAdapter` is used. Any failure here (missing key, missing
 * connected account, auth/rate-limit error, network error, unsuccessful tool
 * call) is returned as a structured error so the skill can fall back to mock
 * safely.
 */
class ComposioRealAdapter implements ComposioAdapter {
  isAvailable(): boolean {
    return isComposioRealAdapterAvailable();
  }

  async execute(request: ComposioToolRequest): Promise<ComposioToolResult> {
    const config = getComposioConfig();
    const risk = classifyActionRisk(request.action);

    const client = await getComposioClient(config.apiKey);
    if (!client) {
      logComposioCall({ toolkit: request.toolkit, action: request.action, source: "composio_api", success: false, errorCode: "missing_api_key" });
      return {
        toolkit: request.toolkit,
        action: request.action,
        success: false,
        source: "composio_api",
        risk,
        error: { message: "Composio no está configurado (falta COMPOSIO_API_KEY).", code: "missing_api_key", recoverable: true },
      };
    }

    try {
      const response = await client.tools.execute(request.action, {
        arguments: request.params,
        userId: request.userId ?? config.userId,
        // @composio/core >=0.11 exige este flag para ejecutar con la versión "latest"
        // del toolkit; sin él Gmail/Calendar/Notion lanzan ComposioToolVersionRequiredError.
        dangerouslySkipVersionCheck: true,
      });

      if (!response.successful) {
        logComposioCall({ toolkit: request.toolkit, action: request.action, source: "composio_api", success: false, errorCode: "unsuccessful" });
        return {
          toolkit: request.toolkit,
          action: request.action,
          success: false,
          data: response.data,
          source: "composio_api",
          risk,
          error: { message: response.error ?? "La acción de Composio no tuvo éxito.", code: "unsuccessful", recoverable: true },
        };
      }

      logComposioCall({ toolkit: request.toolkit, action: request.action, source: "composio_api", success: true });
      return {
        toolkit: request.toolkit,
        action: request.action,
        success: true,
        data: response.data,
        source: "composio_api",
        risk,
      };
    } catch (err) {
      const error = classifyError(err);
      logComposioCall({ toolkit: request.toolkit, action: request.action, source: "composio_api", success: false, errorCode: error.code });
      return {
        toolkit: request.toolkit,
        action: request.action,
        success: false,
        source: "composio_api",
        risk,
        error,
      };
    }
  }

  /**
   * Checks which of the configured user's allowed toolkits have an active
   * connected account in Composio. Returns "not_supported_yet" if Composio
   * isn't configured or the check itself fails — never throws. Used only by
   * the `/composio/status` diagnostic endpoint.
   */
  async checkConnectedAccounts(config: ComposioConfig = getComposioConfig()): Promise<ConnectedAccountsCheck> {
    const client = await getComposioClient(config.apiKey);
    if (!client) return "not_supported_yet";

    try {
      const response = await client.connectedAccounts.list({
        userIds: [config.userId],
        toolkitSlugs: config.allowedToolkits,
      });

      const connected = new Set(
        response.items
          .filter((item) => item.status === "ACTIVE")
          .map((item) => item.toolkit.slug.toLowerCase())
      );

      const result: Record<ComposioToolkit, boolean> = {} as Record<ComposioToolkit, boolean>;
      for (const toolkit of config.allowedToolkits) {
        result[toolkit] = connected.has(toolkit);
      }
      return result;
    } catch {
      return "not_supported_yet";
    }
  }
}

export const composioRealAdapter = new ComposioRealAdapter();
