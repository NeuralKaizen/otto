import "./env.js";
import Fastify from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyWebsocket from "@fastify/websocket";
import { registerSkillRegistry } from "@wattson/agent-core";
import { getSkill, listSkills } from "@wattson/skills";
import { env } from "./env.js";
import { corsOrigins } from "./cors.js";
import { registerWebSocket } from "./ws/agentSocket.js";
import { healthRoutes } from "./routes/health.routes.js";
import { chatRoutes } from "./routes/chat.routes.js";
import { memoryRoutes } from "./routes/memory.routes.js";
import { skillsRoutes } from "./routes/skills.routes.js";
import { voiceRoutes } from "./routes/voice.routes.js";
import { approvalsRoutes } from "./routes/approvals.routes.js";
import { socialRoutes } from "./routes/social.routes.js";
import { notionRoutes } from "./routes/notion.routes.js";
import { composioRoutes } from "./routes/composio.routes.js";

const app = Fastify({ logger: true });

await app.register(fastifyCors, {
  origin: corsOrigins({ webUrl: env.WEB_URL, nodeEnv: env.NODE_ENV }),
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
});

await app.register(fastifyWebsocket);

registerSkillRegistry({ getSkill, listSkills });

registerWebSocket(app);
healthRoutes(app);
chatRoutes(app);
memoryRoutes(app);
skillsRoutes(app);
voiceRoutes(app);
approvalsRoutes(app);
socialRoutes(app);
notionRoutes(app);
composioRoutes(app);

app.setErrorHandler((err, _req, reply) => {
  app.log.error(err);
  reply.status(err.statusCode ?? 500).send({ ok: false, error: err.message ?? "Internal server error" });
});

try {
  await app.listen({ port: env.API_PORT, host: "0.0.0.0" });
  app.log.info(`Wattson API running at http://localhost:${env.API_PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
