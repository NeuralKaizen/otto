import type { FastifyInstance } from "fastify";
import { routePlatformRequest, getSocialConfig, validateSocialConfig, getSocialRuntimeState, isZernioRealAdapterAvailable } from "@jarvis/skills";
import type { SocialPlatform } from "@jarvis/skills";

export function socialRoutes(app: FastifyInstance): void {
  app.get("/social/status", async (_req, reply) => {
    const config = getSocialConfig();
    const status = validateSocialConfig(config);
    const runtime = getSocialRuntimeState();
    const warnings = Array.from(new Set([...status.warnings, ...runtime.warnings]));

    reply.send({
      ok: true,
      data: {
        enabled: status.enabled,
        zernioEnabled: status.zernioEnabled,
        zernioConfigured: status.zernioConfigured,
        canUseZernio: status.canUseZernio,
        mockFallbackEnabled: status.mockFallbackEnabled,
        mode: status.mode,
        zernioReadOnly: config.zernioReadOnlyMode,
        zernioRealAdapterAvailable: isZernioRealAdapterAvailable(config),
        lastKnownMode: runtime.lastKnownMode ?? null,
        checkedAt: runtime.checkedAt ?? null,
        warnings,
      },
    });
  });

  app.get<{
    Querystring: { platform?: string; username?: string };
  }>("/social/metrics", async (req, reply) => {
    const { platform = "all", username } = req.query;

    if (!username) {
      return reply.status(400).send({ ok: false, error: "Missing required query param: username" });
    }

    const validPlatforms: string[] = ["instagram", "tiktok", "youtube", "all"];
    if (!validPlatforms.includes(platform)) {
      return reply.status(400).send({ ok: false, error: `Invalid platform. Use: ${validPlatforms.join(", ")}` });
    }

    try {
      const result = await routePlatformRequest({
        platform: platform as SocialPlatform,
        username: username.replace(/^@/, ""),
        includeRecentContent: true,
        includeAnalysis: true,
      });
      return reply.send({ ok: true, data: result });
    } catch (err) {
      app.log.error(err, "social metrics error");
      return reply.status(500).send({ ok: false, error: "Failed to fetch social metrics" });
    }
  });
}
