# Handoff: estado de Alfred (Wattson) y próximos pasos

> **Para la próxima sesión de Claude:** este doc es el punto de entrada. Leelo entero antes de tocar código. El historial fino de decisiones está en `.superpowers/sdd/progress.md` (ledger, gitignoreado — solo local) y los specs/planes en `docs/superpowers/`.

**Fecha:** 2026-07-03 · **Branch principal:** `feat/voice-hud-prototype` (todo mergeado y pusheado en `bf49fb4`)

## Qué funciona hoy (verificado E2E con mic y datos reales)

El ciclo completo de voz: decir **"Alfred"** → preguntar (es-AR, Web Speech) → el agente responde con **voz de ElevenLabs** (`eleven_flash_v2_5`) → si la consulta es de métricas sociales, dibuja **widgets con datos reales de Zernio** (KPIs + gráficas de barras SVG con coreografía beat a beat).

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
4. **Los fallos de conversación son mudos**: `converseFailed` vuelve a escuchar sin decir nada. Un timeout se siente igual que "no me escuchó" — engaña en el debugging (ver pendiente #2).

## Pendientes, en orden sugerido

### 1. Rotar la API key de ElevenLabs (seguridad, 5 min, primero)
La key actual pasó por el chat de una sesión. Dashboard de ElevenLabs → API Keys → generar nueva → pegar en `.env` (`ELEVENLABS_API_KEY`) → reiniciar backend.

### 2. Errores audibles (UX, chico y de alto impacto)
Cuando `converse` falla (timeout, red, backend caído), el FSM emite `converseFailed` y vuelve a `listening` **en silencio**. Hacer que hable algo tipo "perdón, no pude procesar eso" antes de volver a escuchar.
- Tocar: `sessionMachine.ts` (efecto `speak` en la transición de `converseFailed`) + tests en `sessionMachine.test.ts`/`useSession.test.ts`. Ojo: después de hablar el error tiene que volver a `listening`, no quedarse en `speaking`.

### 3. Barge-in (interrumpir a Alfred mientras habla)
Todo está listo menos el disparo: el evento `bargeIn` existe en el FSM (`speaking → listening` + `stopSpeaking`) y `ElevenLabsSpeaker.stop()` corta limpio, pero **nadie despacha `bargeIn`** — el checklist E2E lo promete y es imposible hoy.
- Decisión de diseño pendiente: ¿qué lo dispara? Opciones: (a) el wake word durante `speaking` (requiere repensar la pausa del wake — hoy está apagado en sesión, y prenderlo mientras Alfred habla arriesga que se auto-escuche decir "Alfred"); (b) cualquier voz detectada por el transcriptor durante `speaking` (más natural, más falsos positivos con el audio del TTS saliendo por los parlantes). Hacer brainstorming antes de implementar.

### 4. Robustez del transcriptor (bug latente conocido)
`WebSpeechTranscriber` no tiene auto-restart en `onend` ni handler de `onerror` (el wake sí tiene ambos). Chrome corta el reconocimiento tras unos segundos de silencio: si el usuario tarda en formular la pregunta después de "Alfred", el transcriptor muere en silencio y la sesión queda escuchando la nada hasta el timeout de 35s.
- Fix: replicar el patrón del wake (`onend → safeStart` mientras esté activo, guard con `this.rec`) + `console.warn` en `onerror`. Tests con los fakes.

### 5. Minors diferidos de reviews (deuda chica, hacer en una pasada)
- Test de `speak()` re-entrante sin `stop()` externo (`elevenLabsSpeaker.test.ts`).
- Test del camino `audio.onerror` (hoy solo está testeado `play()` rechazado).
- Comentario en `ElevenLabsSpeaker.stop()` explicando el `fallback.stop()` incondicional.
- `sessionMachine.ts` tiene un TODO real: `lastFinalTranscript` es estado a nivel módulo (rompería con multi-instancia) — subirlo a un struct de estado.

### 6. CORS multi-origen (cuando se vuelva a usar apps/web)
`apps/api/src/server.ts` acepta un solo origen. Cambiar a array (`[WEB_URL, HUD_URL]` o regex localhost en dev) para que HUD (:5173) y web (:3000) convivan.

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
- Antes de asumir un bug "imposible", revisar las 4 lecciones de arriba y el ledger.
