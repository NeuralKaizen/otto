import { config } from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

config({ path: resolve(__dirname, "../../../.env") });

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  API_PORT: parseInt(process.env.API_PORT ?? "4000", 10),
  WEB_URL: process.env.WEB_URL ?? "http://localhost:3000",
  DATABASE_URL: process.env.DATABASE_URL ?? "file:./jarvis.db",
  LLM_PROVIDER: process.env.LLM_PROVIDER ?? "mock",
  ENABLE_REAL_LLM: process.env.ENABLE_REAL_LLM !== "false",
  ENABLE_STREAMING: process.env.ENABLE_STREAMING !== "false",
  STREAMING_CHUNK_DELAY_MS: parseInt(process.env.STREAMING_CHUNK_DELAY_MS ?? "25", 10),
  VOICE_PROVIDER: process.env.VOICE_PROVIDER ?? "mock",
  ENABLE_APPROVALS: process.env.ENABLE_APPROVALS !== "false",
  ENABLE_SOCIAL_METRICS: process.env.ENABLE_SOCIAL_METRICS !== "false",
  ENABLE_NOTION: process.env.ENABLE_NOTION === "true",
  ENABLE_YOUTUBE_REAL_METRICS: process.env.ENABLE_YOUTUBE_REAL_METRICS === "true",
  ENABLE_INSTAGRAM_REAL_METRICS: process.env.ENABLE_INSTAGRAM_REAL_METRICS === "true",
  ENABLE_TIKTOK_REAL_METRICS: process.env.ENABLE_TIKTOK_REAL_METRICS === "true",
};
