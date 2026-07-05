# Handoff: estado de Alfred (Wattson) y próximos pasos

> **Para la próxima sesión de Claude:** este doc es el punto de entrada. Leelo entero antes de tocar código. El historial fino de decisiones está en `.superpowers/sdd/progress.md` (ledger, gitignoreado — solo local) y los specs/planes en `docs/superpowers/`.

**Fecha:** 2026-07-03 (última actualización tras `b4d44cc`) · **Branch principal:** `feat/voice-hud-prototype` (todo mergeado y pusheado; HEAD útil: `b4d44cc`)

## Qué funciona hoy (verificado E2E con mic y datos reales)

El ciclo completo de voz: decir **"Alfred"** → saluda a Luciano (rotación de 3 saludos, **español neutro — el usuario rechazó el voseo**) y recién ahí abre el mic → preguntar (es-AR, Web Speech) → el agente responde con **voz de ElevenLabs** (`eleven_flash_v2_5`) → si la consulta es de métricas sociales, dibuja **widgets con datos reales de Zernio** (KPIs + gráficas de barras SVG con coreografía beat a beat). Si la conversación falla, lo dice en voz alta ("Perdón, no pude procesar eso...") y vuelve a escuchar — nada falla mudo. Frases del asistente: `WAKE_GREETINGS` y `CONVERSE_ERROR_NARRATION` en `sessionMachine.ts`.

- Interfaz: `apps/hud` (React 19 + Vite, puerto 5173). Backend: `apps/api` (Fastify, puerto 4000).
- Cuenta de Instagram del usuario: **@lucianomusellaa** — configurada como `SOCIAL_DEFAULT_USERNAME` en `.env`, así "cómo vienen mis métricas de instagram" (sin @, como sale del dictado) resuelve a su cuenta. Prioridad: `@` explícito > contexto de sesión > default.
- Frase de cierre de sesión de voz: **"listo"**.

### Cómo levantarlo

```bash
# Terminal A — backend (debe loguear "[voice] Using ElevenLabs TTS")
pnpm dev:api
# Terminal B — HUD
pnpm --filter @wattson/hud dev   # abrir http://localhost:5173 en Chrome (Web Speech no anda en Firefox)
```

El `.env` raíz ya tiene todo: `VOICE_PROVIDER=elevenlabs`, `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` (voz elegida: `8mBRP99B2Ng2QwsJMFQl`), `ENABLE_ZERNIO=true` + `ZERNIO_API_KEY`, `SOCIAL_DEFAULT_USERNAME=lucianomusellaa`, `WEB_URL=http://localhost:5173` (CORS).

### Mapa de piezas clave

| Pieza | Archivo |
|---|---|
| FSM de sesión de voz (no tocar a la ligera) | `apps/hud/src/voice/sessionMachine.ts` + `useSession.ts` |
| Adapters wake/STT (Web Speech) | `apps/hud/src/voice/adapters/webSpeech.ts` |
| TTS ElevenLabs con fallback a voz del browser | `apps/hud/src/voice/adapters/elevenLabsSpeaker.ts` |
| Cliente del agente (POST /chat + eventos WS) | `apps/hud/src/api/agentClient.ts` + hook `useAgentClient.ts` |
| Extractor de widgets desde tool results | `apps/hud/src/api/metricsWidgets.ts` |
| Widgets + coreografía | `apps/hud/src/hud/widgets/` + `Canvas.tsx` |
| Skill de métricas + parser + config | `packages/skills/src/social/` |
| Endpoint TTS del backend | `apps/api/src/routes/voice.routes.ts` → `packages/voice` |

### Lecciones que costaron debugging real (no re-aprender)

1. **Chrome permite UN solo SpeechRecognition por página.** El wake detector se pausa mientras la sesión está abierta (`useSession` lo maneja por estado). Si voz "deja de escuchar", sospechar de esto primero.
2. **`agentClient.dispose()` es permanente.** React StrictMode (dev) desmonta/remonta a propósito; por eso existe el hook `useAgentClient` (crea el cliente dentro del efecto). No volver a `useMemo(createAgentClient) + dispose en cleanup`.
3. **El backend acepta UN solo origen CORS** (`WEB_URL`). Hoy apunta a :5173 (HUD); `apps/web` (:3000) quedó sin acceso.
4. **Alfred nunca debe hablar con el mic abierto** (se transcribe a sí mismo). Por eso saludo y error pasan por el estado `speaking` y el mic se abre en `ttsEnd`. Mantener ese patrón en cualquier narración nueva.
5. **Las frases del asistente van en español neutro** (nada de voseo) — preferencia explícita del usuario.

## Pendientes, en orden sugerido

### 1. Rotar la API key de ElevenLabs (seguridad, 5 min, primero)
La key actual pasó por el chat de una sesión. Dashboard de ElevenLabs → API Keys → generar nueva → pegar en `.env` (`ELEVENLABS_API_KEY`) → reiniciar backend.

### 2. ~~Errores audibles + saludo al despertar~~ — HECHO (`b4d44cc`)
`converseFailed` y `wakeDetected` ahora pasan por `speaking` (narración) y `ttsEnd` abre/reabre el mic. Nada pendiente aquí.

### 3. ~~Barge-in~~ — HECHO (2026-07-04, opción elegida por el usuario: wake word)
Decir **"Alfred" mientras Alfred habla** lo interrumpe: el wake detector queda vivo también en `speaking` y el FSM trata `wakeDetected` en esa fase como barge-in (`stopSpeaking` + mic abierto). Para respetar la lección #1, el efecto `startListening` apaga el wake ANTES de arrancar el transcriptor (el cleanup de React llegaría tarde). Riesgo asumido y documentado: si una narración dijera "Alfred" por los parlantes se auto-interrumpiría — las frases fijas no lo dicen.
- Falta validar E2E con mic real (los tests unitarios cubren FSM + hook con fakes).

### 4. ~~Robustez del transcriptor~~ — HECHO (2026-07-04)
`WebSpeechTranscriber` ahora replica el patrón del wake: `onend → safeStart` mientras esté activo (guard con `this.rec`) y `console.warn` en `onerror`. Tests con un fake de `SpeechRecognition` en `webSpeech.test.ts`.

### 5. ~~Minors diferidos de reviews~~ — HECHO (2026-07-04)
Tests de `speak()` re-entrante y de `audio.onerror`, comentario en `ElevenLabsSpeaker.stop()`, y `reduce` ahora es pura: el estado (`phase`, `lastFinalTranscript`, `greetingIndex`) vive en el struct `SessionSnapshot` — nada a nivel módulo (hay test de pureza con dos máquinas).

### 6. ~~CORS multi-origen~~ — HECHO (2026-07-04)
`corsOrigins()` en `apps/api/src/cors.ts` (con tests node:test): en dev permite cualquier `http://localhost:*` (HUD :5173 y web :3000 conviven); en producción solo `WEB_URL` + orígenes de Tauri.

### 7. Deploy (el objetivo es grabar una demo — coordinar con el usuario)
- **Backend**: necesita Node persistente (Fastify + WebSocket + SQLite) → NO va en Vercel. Decidir hosting (Railway/Fly/VPS) y qué pasa con SQLite (¿migrar a Postgres?). Nada de esto está empezado.
- **HUD en Vercel**: `vercel.json` ya construye solo el HUD. Falta setear `VITE_API_URL`/`VITE_WS_URL` (env de Vercel) apuntando al backend deployado, y el `WEB_URL` del backend apuntando al dominio del HUD.
- El mic de Web Speech requiere HTTPS en producción (localhost está exento).

### 8. Ideas de producto sin empezar (validar con el usuario antes)
- Consultas multi-plataforma por voz ("compará mis redes") — el parser ya soporta `platform: all`; falta conectar TikTok/YouTube en Zernio y ver cómo se ven los widgets multi-serie.
- Approvals reales por voz (hoy se auto-declinan con narración fija — fue decisión de la iteración 1).
- Pulido visual para la demo (el usuario le da importancia).

## Convenciones de trabajo de este repo

- Flujo superpowers: brainstorming → spec (`docs/superpowers/specs/`) → plan (`docs/superpowers/plans/`) → ejecución con subagentes + reviews. TDD siempre.
- Commits en español, con `Co-Authored-By: Claude <modelo> <noreply@anthropic.com>`.
- Está OK modificar código del colega — la meta es que funcione bien (preferencia explícita del usuario).
- Antes de asumir un bug "imposible", revisar las 5 lecciones de arriba y el ledger.
