import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createTTSProvider } from "@wattson/voice";

const ttsBodySchema = z.object({ text: z.string().min(1) });

export function voiceRoutes(app: FastifyInstance): void {
  app.post("/voice/tts", async (req, reply) => {
    const parsed = ttsBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ ok: false, error: parsed.error.message });
    }

    try {
      const tts = createTTSProvider();
      const result = await tts.synthesize(parsed.data.text);

      if (result.audioBuffer) {
        reply
          .header("Content-Type", "audio/mpeg")
          .send(Buffer.from(result.audioBuffer));
      } else {
        reply.send({ ok: true, data: { provider: result.provider, audioUrl: result.audioUrl ?? null, message: result.message } });
      }
    } catch (err) {
      app.log.error(err, "TTS error");
      reply.status(500).send({ ok: false, error: "TTS failed" });
    }
  });
}
