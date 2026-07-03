import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  notionWorkspaceSkill,
  getNotionWorkspaceConfig,
  getNotionRuntimeState,
  validateNotionWorkspaceConfig,
  discoverNotionActionSupport,
} from "@jarvis/skills";

const notionQuerySchema = z.object({
  q: z.string().min(1),
});

interface NotionRouteDeps {
  execute?: typeof notionWorkspaceSkill.execute;
  discover?: typeof discoverNotionActionSupport;
}

export function notionRoutes(app: FastifyInstance, deps: NotionRouteDeps = {}): void {
  const execute = deps.execute ?? notionWorkspaceSkill.execute.bind(notionWorkspaceSkill);
  const discover = deps.discover ?? discoverNotionActionSupport;

  app.get("/notion/status", async (_req, reply) => {
    const config = getNotionWorkspaceConfig();
    const status = validateNotionWorkspaceConfig(config);
    const runtime = getNotionRuntimeState();
    const discovery = await discover(config);
    const warnings = Array.from(new Set([
      ...status.warnings,
      ...runtime.warnings,
      ...discovery.warnings,
    ]));
    const canSearch = status.enabled &&
      status.configured &&
      discovery.notionConnected === true &&
      (discovery.actionValidation.search === true || discovery.actionValidation.queryDatabase === true);
    const canCreatePage = status.enabled &&
      status.configured &&
      status.defaultParentConfigured &&
      !status.readOnlyMode &&
      discovery.notionConnected === true &&
      discovery.actionValidation.createPage === true;
    const canCreateTask = status.enabled &&
      status.configured &&
      status.tasksDatabaseConfigured &&
      !status.readOnlyMode &&
      discovery.notionConnected === true &&
      discovery.actionValidation.createDatabaseItem === true;

    return reply.send({
      ok: true,
      data: {
        enabled: status.enabled,
        provider: status.provider,
        configured: status.configured,
        composioConfigured: status.composioConfigured,
        userIdPresent: status.userIdPresent,
        defaultParentConfigured: status.defaultParentConfigured,
        tasksDatabaseConfigured: status.tasksDatabaseConfigured,
        readOnlyMode: status.readOnlyMode,
        requireApproval: status.requireApproval,
        canSearch,
        canCreatePage,
        canCreateTask,
        notionConnected: discovery.notionConnected,
        actionValidation: discovery.actionValidation,
        validatedSlugs: discovery.foundSlugs,
        missingSlugs: discovery.missingSlugs,
        lastKnownMode: runtime.lastKnownMode ?? null,
        warnings,
        checkedAt: runtime.checkedAt ?? null,
      },
    });
  });

  app.get<{
    Querystring: { q?: string };
  }>("/notion/query", async (req, reply) => {
    const parsed = notionQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ ok: false, error: parsed.error.message });
    }

    try {
      const result = await execute({ message: parsed.data.q }, {});
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
      app.log.error(err, "notion dedicated skill error");
      return reply.status(500).send({ ok: false, error: "Failed to execute Notion dedicated skill" });
    }
  });
}
