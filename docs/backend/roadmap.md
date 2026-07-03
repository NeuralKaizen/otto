# Roadmap

## Phase 1 — MVP Local Web (current)
- [x] Monorepo (pnpm + turbo)
- [x] Fastify API with WebSocket
- [x] Vite + React UI (Jarvis style)
- [x] Mock LLM provider
- [x] SQLite memory (Prisma)
- [x] Skill registry
- [x] LinkedIn post ideas skill
- [x] Memory save/search skills
- [x] Mock calendar skill
- [x] System status skill
- [x] Approval system foundation
- [x] Voice input (browser SpeechRecognition)
- [x] ElevenLabs TTS stub

## Phase 2 — Real Voice (ElevenLabs)
- [ ] ElevenLabs TTS fully wired in web app
- [ ] Audio playback after `message_done`
- [ ] Whisper STT via API or local model

## Phase 3 — Tauri Desktop App
- [ ] Wrap web app in Tauri
- [ ] System tray integration
- [ ] Global hotkey to open Jarvis

## Phase 4 — Notion + Fathom
- [ ] Fathom transcript ingestion skill
- [ ] Notion page creation skill (with approval)
- [ ] Notion database query skill

## Phase 5 — Gmail + Google Calendar
- [ ] OAuth2 integration
- [ ] Email draft skill (approval required)
- [ ] Calendar event creation skill (approval required)
- [ ] Real calendar read skill

## Phase 6 — Local LLM (Ollama)
- [ ] Ollama provider implementation
- [ ] Model selection via env
- [ ] Streaming support

## Phase 7 — Scheduler
- [ ] Cron-based task runner
- [ ] "Remind me every Monday" support
- [ ] Recurring memory summaries

## Phase 8 — Multi-channel Gateway
- [ ] WhatsApp channel (via Twilio or Meta API)
- [ ] Telegram channel
- [ ] Email channel

## Phase 9 — Browser Automation Sandbox
- [ ] Playwright integration
- [ ] Sandboxed execution with Docker
- [ ] Screenshot and DOM inspection skills

## Phase 10 — Subagents
- [ ] Spawnable specialized agents
- [ ] Research agent
- [ ] Writing agent
- [ ] Data extraction agent
