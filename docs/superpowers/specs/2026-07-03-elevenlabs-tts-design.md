# Spec: Voz ElevenLabs en el HUD + wake word Alfred

**Fecha:** 2026-07-03
**Branch:** `feat/wattson-voice-wiring`
**Estado previo:** Plan B (voz↔agente) completo — `agentClient` cableado como seam `converse`. Verificación manual E2E pendiente; durante ella se detectó que el wake word "wattson" se reconoce como "whatsapp".

## Objetivo

1. Que el agente hable con una voz de ElevenLabs (TTS) en vez de la voz robótica de `speechSynthesis`, sin quedar mudo nunca.
2. Cambiar la palabra de activación a "Alfred" (el reconocimiento es-AR confunde "wattson" con "whatsapp").

**Alcance acotado:** solo TTS. El wake word y el STT siguen con Web Speech (gratis, ya funcionan). Nada de streaming de audio ni WebSocket de voz en esta iteración.

## Decisiones

| Decisión | Elección | Por qué |
|---|---|---|
| Alcance ElevenLabs | Solo TTS (voz de salida) | El plan de $6 (~30k créditos/mes) rinde mucho más pagando solo la voz del agente; wake/STT continuos serían carísimos. |
| Fallback ante fallo | Degradar a `SpeechSynthesisSpeaker` | Sin créditos / sin red / error 500 → el agente suena robótico pero nunca queda mudo. |
| Modelo | `eleven_flash_v2_5` | Español, latencia ~75ms, 0.5 créditos/carácter (~60k caracteres/mes con el plan actual). `eleven_monolingual_v1` (el actual en código) es solo inglés — hay que cambiarlo sí o sí. |
| Voz (`ELEVENLABS_VOICE_ID`) | La que esté en `.env`; default Rachel (`21m00Tcm4TlvDq8ikWAM`) | El usuario todavía no eligió voz definitiva; la selecciona después en el dashboard de ElevenLabs sin tocar código. |
| Wake word | `"alfred"` y `"alfredo"` | El reconocimiento es-AR va a transcribir "Alfredo" seguido; aceptar ambas variantes. Solo cambia la palabra de activación, no el nombre visible del asistente. |

## Arquitectura

El HUD **nunca ve la API key**. El flujo:

```
FSM → speak(text) → ElevenLabsSpeaker
                      ├── POST {VITE_API_URL}/voice/tts {text}   (backend ya existe)
                      │     └── backend → ElevenLabs → audio/mpeg
                      ├── reproduce el MP3 con un elemento Audio (blob URL)
                      ├── al terminar → onEnd()          ← regla de oro: nunca colgar
                      └── ante CUALQUIER fallo → fallback a SpeechSynthesisSpeaker para ese texto
```

**No se tocan:** la FSM (`sessionMachine.ts`), `useSession.ts`, el `agentClient`, la interfaz `Speaker`.

## Componentes

### 1. `apps/hud/src/voice/adapters/elevenLabsSpeaker.ts` (nuevo)

`ElevenLabsSpeaker implements Speaker`:

- `speak(text, onEnd)`: `POST /voice/tts` → valida `ok` + `Content-Type: audio/mpeg` → `blob()` → `URL.createObjectURL` → `new Audio(url)` → `play()`. `onEnd` se dispara exactamente una vez, en `ended`, en `error` del audio, o vía el fallback.
- Fallo (fetch rechaza, status no-ok, content-type no-audio — p.ej. el provider mock devuelve JSON —, o `play()` rechaza): `console.warn` + delega ese `speak` al `SpeechSynthesisSpeaker` interno.
- `stop()`: idempotente; pausa el `Audio`, revoca el blob URL, y también hace `stop()` del speaker de fallback (barge-in cubierto en ambos caminos). Un `speak` interrumpido por `stop()` no dispara `onEnd` duplicado.
- Inyectables para test: `fetchImpl`, `createAudio`, speaker de fallback.
- Config: `VITE_API_URL` (default `http://localhost:4000`), mismo patrón que `agentClient`.

### 2. Backend: `packages/voice/src/tts/elevenlabsTts.ts` (ajuste)

- `model_id: "eleven_flash_v2_5"` (era `eleven_monolingual_v1`).
- Todo lo demás queda: la ruta `POST /voice/tts` y `createTTSProvider()` ya existen y funcionan.

### 3. Config: `.env`

- `VOICE_PROVIDER=elevenlabs` (hoy cae en mock).
- `ELEVENLABS_API_KEY` / `ELEVENLABS_VOICE_ID` ya están; la voz definitiva se elige después en el dashboard.

### 4. Wake word: `apps/hud/src/voice/adapters/webSpeech.ts` (ajuste)

- El matcheo pasa de `t.includes("wattson")` a matchear `"alfred"` o `"alfredo"` (`includes` sobre el transcript lowercased; "alfredo" contiene "alfred", así que basta `includes("alfred")`).
- Se eliminan los `console.log` de diagnóstico marcados `[DIAG temporal]` (soporte y transcript). El handler `onerror` queda, como `console.warn` permanente y sin la marca: es la única señal visible cuando falla el permiso de micrófono.

### 5. Wiring: `apps/hud/src/App.tsx`

- `tts: new SpeechSynthesisSpeaker()` → `tts: new ElevenLabsSpeaker()`.

## Manejo de errores

- **Todo camino termina en `onEnd`** (éxito, error de red, error de reproducción, fallback): el FSM nunca queda trabado en `speaking`.
- `stop()` durante la reproducción o durante el fetch: no dispara `onEnd` tardío (flag `cancelled` por utterance).
- Backend caído: el fetch falla rápido → fallback browser → la conversación sigue.
- Sin créditos ElevenLabs: el backend responde 500 → mismo camino de fallback.

## Testing

Vitest (jsdom) con dependencias falsas inyectadas, mismo estilo que `agentClient.test.ts`:

1. Happy path: POST correcto a `/voice/tts`, reproduce el audio, `onEnd` al `ended`.
2. Fetch falla → fallback al speaker interno, `onEnd` una sola vez.
3. Respuesta no-audio (JSON del mock) → fallback.
4. `play()` rechaza → fallback.
5. `stop()` corta el audio, revoca blob URL, no hay `onEnd` fantasma; `stop()` doble no rompe.
6. Wake word: transcripts "alfred", "alfredo", "hey alfred" matchean; "whatsapp" y "wattson" no.

Verificación manual E2E al final (humana): backend + HUD levantados, decir "Alfred", pregunta de lectura, confirmar que responde con la voz de ElevenLabs; apagar `VOICE_PROVIDER` o el backend y confirmar el fallback robótico.

## Fuera de alcance

- STT / wake word por ElevenLabs.
- Streaming de audio (chunked) — el MP3 se reproduce completo; si la latencia molesta, es una iteración futura.
- Cambio del nombre visible del asistente en la UI.
- Selección de la voz definitiva (manual, dashboard de ElevenLabs).
