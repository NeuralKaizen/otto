import type { FastifyInstance } from "fastify";
import {
  composioSkill,
  composioRealAdapter,
  getComposioConfig,
  isComposioRealAdapterAvailable,
  listAvailableTools,
} from "@jarvis/skills";

export function composioRoutes(app: FastifyInstance): void {
  app.get("/composio/tools", async (_req, reply) => {
    const config = getComposioConfig();

    return reply.send({
      ok: true,
      enabled: config.enabled,
      readOnly: config.readOnly,
      requireApprovalForWrite: config.requireApprovalForWrite,
      allowedToolkits: config.allowedToolkits,
      tools: listAvailableTools(config),
    });
  });

  /**
   * Safe diagnostic snapshot of the Composio integration: whether it's
   * enabled, running in "real" or "mock" mode, and (best-effort) which
   * allowed toolkits have a connected account. Never returns the API key.
   */
  app.get("/composio/status", async (_req, reply) => {
    const config = getComposioConfig();
    const realAdapterAvailable = isComposioRealAdapterAvailable(config);

    const connectedAccountsCheck = realAdapterAvailable
      ? await composioRealAdapter.checkConnectedAccounts(config)
      : "not_supported_yet";

    // Build safe warnings — never include secrets.
    const warnings: string[] = [];
    if (!config.enabled) {
      warnings.push("Composio está desactivado (ENABLE_COMPOSIO=false). Usando datos simulados.");
    } else if (!config.apiKey) {
      warnings.push("Falta COMPOSIO_API_KEY — el modo real no está disponible. Usando datos simulados.");
    }
    if (!config.userId) {
      warnings.push("COMPOSIO_USER_ID no configurado — las cuentas conectadas no se pueden verificar.");
    }
    if (config.readOnly) {
      warnings.push("COMPOSIO_READ_ONLY_MODE=true — las acciones de escritura/envío/eliminación están bloqueadas.");
    }
    if (config.requireApprovalForWrite && !config.readOnly) {
      warnings.push("COMPOSIO_REQUIRE_APPROVAL_FOR_WRITE=true — las acciones de escritura requieren aprobación del usuario.");
    }

    return reply.send({
      enabled: config.enabled,
      mode: realAdapterAvailable ? "real" : "mock",
      readOnly: config.readOnly,
      requireApprovalForWrite: config.requireApprovalForWrite,
      userId: config.userId ? config.userId : null,
      allowedToolkits: config.allowedToolkits,
      realAdapterAvailable,
      configured: {
        hasApiKey: Boolean(config.apiKey),
        hasUserId: Boolean(config.userId),
      },
      connectedAccountsCheck,
      warnings,
    });
  });

  app.get<{
    Querystring: { q?: string };
  }>("/composio/execute", async (req, reply) => {
    const { q } = req.query;

    if (!q) {
      return reply.status(400).send({ ok: false, error: "Missing required query param: q" });
    }

    try {
      const result = await composioSkill.execute({ message: q }, {});
      if (result.requiresApproval) {
        return reply.send({
          ok: true,
          data: result,
          requiresApproval: true,
          message: "This action requires approval and must be executed via WebSocket UI.",
        });
      }
      return reply.send({ ok: true, data: result });
    } catch (err) {
      app.log.error(err, "composio tool gateway error");
      return reply.status(500).send({ ok: false, error: "Failed to execute Composio tool gateway" });
    }
  });
}
