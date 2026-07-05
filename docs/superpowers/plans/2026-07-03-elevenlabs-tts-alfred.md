# Voz ElevenLabs en el HUD + Wake Word Alfred — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El agente habla con una voz de ElevenLabs (vía el endpoint `POST /voice/tts` que ya existe en el backend) con fallback automático a la voz del browser, y el wake word pasa de "wattson" a "alfred"/"alfredo".

**Architecture:** Un nuevo `ElevenLabsSpeaker` implementa la interfaz `Speaker` existente: POSTea el texto a `/voice/tts`, reproduce el MP3 con un elemento `Audio` (blob URL) y ante cualquier fallo degrada a un `SpeechSynthesisSpeaker` interno. Todo camino termina en `onEnd` — el FSM nunca queda trabado en `speaking`. En el backend solo cambia el `model_id` (el actual es solo inglés). La FSM, `useSession` y `agentClient` no se tocan.

**Tech Stack:** TypeScript, React 19 + Vite (`apps/hud`), Vitest + jsdom, backend Fastify (`apps/api`) + `@wattson/voice`.

**Spec:** `docs/superpowers/specs/2026-07-03-elevenlabs-tts-design.md`

## Global Constraints

- **La interfaz `Speaker` (`apps/hud/src/voice/types.ts`) NO cambia**: `speak(text, onEnd)` / `stop()` idempotente.
- **`onEnd` se dispara exactamente una vez por `speak`** (éxito, fallo o fallback) — salvo que `stop()` lo haya cancelado, en cuyo caso no se dispara.
- **El HUD nunca ve la API key de ElevenLabs**: todo pasa por `POST {VITE_API_URL}/voice/tts`.
- Modelo TTS: `eleven_flash_v2_5`. Voz: la de `ELEVENLABS_VOICE_ID` en `.env` (elegirla es paso manual del usuario, fuera del plan).
- Config HUD: `import.meta.env.VITE_API_URL` (default `http://localhost:4000`), mismo patrón que `agentClient.ts`.
- **Hay un diff sin commitear en `webSpeech.ts`** (logs `[DIAG temporal]`): la Tarea 2 lo reescribe; trabajar sobre el working tree tal como está, sin `git stash`.
- Los commits terminan con: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- Trabajar en `/home/newral/Lucianos/otto`, branch `feat/wattson-voice-wiring`.

## File Structure

- **Create** `apps/hud/src/voice/adapters/elevenLabsSpeaker.ts` — el speaker: fetch + Audio + fallback. Una responsabilidad: convertir texto en audio reproducido, sin colgarse jamás.
- **Create** `apps/hud/src/voice/adapters/elevenLabsSpeaker.test.ts` — Vitest con `fetch`, `Audio` y fallback falsos inyectados.
- **Modify** `apps/hud/src/voice/adapters/webSpeech.ts` — extrae `isWakeWord()` pura, matchea "alfred", limpia diagnósticos.
- **Create** `apps/hud/src/voice/adapters/webSpeech.test.ts` — tests del matcheo puro.
- **Modify** `apps/hud/src/App.tsx` — `tts: new ElevenLabsSpeaker()`.
- **Modify** `packages/voice/src/tts/elevenlabsTts.ts` — `model_id: "eleven_flash_v2_5"`.
- **Modify** `.env` (NO se commitea) — `VOICE_PROVIDER=elevenlabs`.

---

## Task 1: `ElevenLabsSpeaker` — happy path, fallback y stop

**Files:**
- Create: `apps/hud/src/voice/adapters/elevenLabsSpeaker.ts`
- Create: `apps/hud/src/voice/adapters/elevenLabsSpeaker.test.ts`

**Interfaces:**
- Consumes: `Speaker` de `../types`; `SpeechSynthesisSpeaker` de `./speechSynthesis`.
- Produces: `class ElevenLabsSpeaker implements Speaker` con
  `constructor(options?: ElevenLabsSpeakerOptions)` donde
  `ElevenLabsSpeakerOptions = { apiUrl?: string; fetchImpl?: typeof fetch; createAudio?: (src: string) => HTMLAudioElement; fallback?: Speaker }`.
  Task 3 la instancia sin opciones: `new ElevenLabsSpeaker()`.

- [ ] **Step 1: Escribir los tests que fallan**

Create `apps/hud/src/voice/adapters/elevenLabsSpeaker.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ElevenLabsSpeaker } from "./elevenLabsSpeaker";
import type { Speaker } from "../types";

class FakeAudio {
  src: string;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  paused = false;
  playCalls = 0;
  playResult: Promise<void> = Promise.resolve();
  constructor(src: string) { this.src = src; }
  play() { this.playCalls++; return this.playResult; }
  pause() { this.paused = true; }
}

class FakeFallback implements Speaker {
  spoken: string[] = [];
  stops = 0;
  lastOnEnd: (() => void) | null = null;
  speak(text: string, onEnd: () => void) { this.spoken.push(text); this.lastOnEnd = onEnd; }
  stop() { this.stops++; }
}

function audioFetch() {
  return vi.fn().mockResolvedValue({
    ok: true,
    headers: { get: () => "audio/mpeg" },
    blob: async () => new Blob(["mp3"]),
  });
}

// jsdom no implementa createObjectURL: lo stubbeamos.
beforeEach(() => {
  (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => "blob:fake");
  (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
});

function setup(fetchMock: ReturnType<typeof vi.fn> = audioFetch()) {
  let audio: FakeAudio | null = null;
  const fallback = new FakeFallback();
  const speaker = new ElevenLabsSpeaker({
    apiUrl: "http://x",
    fetchImpl: fetchMock as unknown as typeof fetch,
    createAudio: (src) => (audio = new FakeAudio(src)) as unknown as HTMLAudioElement,
    fallback,
  });
  return { speaker, fallback, fetchMock, get audio() { return audio; } };
}

// Deja drenar la cadena de promesas interna del speaker.
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("ElevenLabsSpeaker", () => {
  it("POSTea a /voice/tts, reproduce y llama onEnd al terminar", async () => {
    const { speaker, fetchMock, fallback, ...rest } = setup();
    const onEnd = vi.fn();
    speaker.speak("hola", onEnd);
    await flush();
    expect(fetchMock).toHaveBeenCalledWith("http://x/voice/tts", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body)).toEqual({ text: "hola" });
    expect(rest.audio!.playCalls).toBe(1);
    expect(onEnd).not.toHaveBeenCalled();
    rest.audio!.onended!();
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fake");
    expect(fallback.spoken).toEqual([]);
  });

  it("si el fetch falla, degrada al fallback y onEnd llega vía el fallback", async () => {
    const bad = vi.fn().mockRejectedValue(new Error("network down"));
    const { speaker, fallback } = setup(bad);
    const onEnd = vi.fn();
    speaker.speak("hola", onEnd);
    await flush();
    expect(fallback.spoken).toEqual(["hola"]);
    expect(onEnd).not.toHaveBeenCalled();
    fallback.lastOnEnd!();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("si el status no es ok, degrada al fallback", async () => {
    const bad = vi.fn().mockResolvedValue({ ok: false, status: 500, headers: { get: () => "application/json" } });
    const { speaker, fallback } = setup(bad);
    speaker.speak("hola", vi.fn());
    await flush();
    expect(fallback.spoken).toEqual(["hola"]);
  });

  it("si la respuesta no es audio (mock devuelve JSON), degrada al fallback", async () => {
    const mockResp = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json; charset=utf-8" },
      blob: async () => new Blob(["{}"]),
    });
    const { speaker, fallback } = setup(mockResp);
    speaker.speak("hola", vi.fn());
    await flush();
    expect(fallback.spoken).toEqual(["hola"]);
  });

  it("si play() rechaza, degrada al fallback una sola vez", async () => {
    const { speaker, fallback, ...rest } = setup();
    const onEnd = vi.fn();
    speaker.speak("hola", onEnd);
    // play() va a rechazar: seteamos el resultado apenas exista el audio
    await Promise.resolve();
    await Promise.resolve();
    if (rest.audio) rest.audio.playResult = Promise.reject(new Error("autoplay blocked"));
    await flush();
    expect(fallback.spoken).toEqual(["hola"]);
    fallback.lastOnEnd!();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("stop() corta el audio, revoca el blob y NO dispara onEnd", async () => {
    const { speaker, fallback, ...rest } = setup();
    const onEnd = vi.fn();
    speaker.speak("hola", onEnd);
    await flush();
    speaker.stop();
    expect(rest.audio!.paused).toBe(true);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fake");
    expect(fallback.stops).toBeGreaterThan(0);
    expect(onEnd).not.toHaveBeenCalled();
    speaker.stop(); // idempotente: no explota
  });

  it("stop() antes de que llegue el audio: no reproduce, no llama onEnd ni fallback", async () => {
    let resolveFetch!: (v: unknown) => void;
    const slow = vi.fn().mockReturnValue(new Promise((r) => { resolveFetch = r; }));
    const { speaker, fallback, ...rest } = setup(slow);
    const onEnd = vi.fn();
    speaker.speak("hola", onEnd);
    speaker.stop();
    resolveFetch({ ok: true, headers: { get: () => "audio/mpeg" }, blob: async () => new Blob(["mp3"]) });
    await flush();
    expect(rest.audio).toBeNull();
    expect(onEnd).not.toHaveBeenCalled();
    expect(fallback.spoken).toEqual([]);
  });
});
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `cd /home/newral/Lucianos/otto && pnpm --filter @wattson/hud test -- elevenLabsSpeaker`
Expected: FAIL — módulo `./elevenLabsSpeaker` no existe.

- [ ] **Step 3: Implementar `elevenLabsSpeaker.ts`**

Create `apps/hud/src/voice/adapters/elevenLabsSpeaker.ts`:
```ts
import type { Speaker } from "../types";
import { SpeechSynthesisSpeaker } from "./speechSynthesis";

const DEFAULT_API_URL = "http://localhost:4000";

export interface ElevenLabsSpeakerOptions {
  apiUrl?: string;
  fetchImpl?: typeof fetch;
  createAudio?: (src: string) => HTMLAudioElement;
  fallback?: Speaker;
}

// Sesión de un speak(): flags para que onEnd se dispare exactamente una vez
// y para que stop() cancele sin onEnd fantasma.
interface SpeakSession {
  cancelled: boolean;
  done: boolean;
  degraded: boolean;
}

// Voz del agente vía backend (POST /voice/tts → MP3). Ante cualquier fallo
// (red, créditos, provider mock, autoplay) degrada a la voz del browser:
// el agente nunca queda mudo y el FSM nunca queda colgado en "speaking".
export class ElevenLabsSpeaker implements Speaker {
  private readonly apiUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly createAudio: (src: string) => HTMLAudioElement;
  private readonly fallback: Speaker;
  private audio: HTMLAudioElement | null = null;
  private blobUrl: string | null = null;
  private session: SpeakSession | null = null;

  constructor(options: ElevenLabsSpeakerOptions = {}) {
    this.apiUrl = options.apiUrl ?? import.meta.env.VITE_API_URL ?? DEFAULT_API_URL;
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
    this.createAudio = options.createAudio ?? ((src) => new Audio(src));
    this.fallback = options.fallback ?? new SpeechSynthesisSpeaker();
  }

  speak(text: string, onEnd: () => void): void {
    this.stop(); // si había algo sonando, lo corta (sesión anterior cancelada)
    const session: SpeakSession = { cancelled: false, done: false, degraded: false };
    this.session = session;

    const finish = () => {
      if (session.done || session.cancelled) return;
      session.done = true;
      this.cleanup();
      onEnd();
    };

    const degrade = (reason: unknown) => {
      if (session.cancelled || session.done || session.degraded) return;
      session.degraded = true;
      console.warn("[tts] ElevenLabs falló, degrado a voz del navegador:", reason);
      this.cleanup();
      this.fallback.speak(text, finish);
    };

    this.fetchImpl(`${this.apiUrl}/voice/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`status ${r.status}`);
        const ct = r.headers.get("content-type") ?? "";
        if (!ct.includes("audio")) throw new Error(`respuesta no-audio (${ct || "sin content-type"})`);
        return r.blob();
      })
      .then((blob) => {
        if (session.cancelled) return;
        this.blobUrl = URL.createObjectURL(blob);
        this.audio = this.createAudio(this.blobUrl);
        this.audio.onended = finish;
        this.audio.onerror = () => degrade(new Error("error de reproducción"));
        return this.audio.play();
      })
      .then(undefined, degrade);
  }

  stop(): void {
    // idempotente: seguro aunque no haya nada sonando
    if (this.session) this.session.cancelled = true;
    this.cleanup();
    this.fallback.stop();
  }

  private cleanup(): void {
    if (this.audio) {
      this.audio.onended = null;
      this.audio.onerror = null;
      this.audio.pause();
      this.audio = null;
    }
    if (this.blobUrl) {
      URL.revokeObjectURL(this.blobUrl);
      this.blobUrl = null;
    }
  }
}
```

Nota sobre el test de `play()` rechazado: el fake setea `playResult` *después* de crear el audio; como la cadena `.then` del speaker todavía no consumió el valor de retorno de `play()` en ese microtick, el rechazo llega al `.then(undefined, degrade)` final. Si el timing del test resulta frágil al correrlo, mover el seteo de `playResult` a un `createAudio` que lo configure en el constructor del fake — no debilitar la aserción.

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `cd /home/newral/Lucianos/otto && pnpm --filter @wattson/hud test -- elevenLabsSpeaker`
Expected: PASS (7 tests).

- [ ] **Step 5: Typecheck y commit**

Run: `cd /home/newral/Lucianos/otto && pnpm --filter @wattson/hud typecheck`
Expected: PASS.
```bash
cd /home/newral/Lucianos/otto
git add apps/hud/src/voice/adapters/elevenLabsSpeaker.ts apps/hud/src/voice/adapters/elevenLabsSpeaker.test.ts
git commit -m "feat(hud): ElevenLabsSpeaker — TTS vía /voice/tts con fallback a voz del browser

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 2: Wake word Alfred + limpieza de diagnósticos

**Files:**
- Modify: `apps/hud/src/voice/adapters/webSpeech.ts:36-56`
- Create: `apps/hud/src/voice/adapters/webSpeech.test.ts`

**Interfaces:**
- Produces: `export function isWakeWord(transcript: string): boolean` en `webSpeech.ts`. `WebSpeechWakeWord` la usa internamente; nadie más la consume (se exporta para testearla).

**Contexto:** el working tree tiene 3 líneas de diagnóstico marcadas `[DIAG temporal]` sin commitear en este archivo. Este task las reemplaza: los dos `console.log` se van; el handler `onerror` QUEDA como `console.warn` permanente (única señal visible cuando falla el permiso de micrófono), sin la marca.

- [ ] **Step 1: Escribir el test del matcheo (falla)**

Create `apps/hud/src/voice/adapters/webSpeech.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { isWakeWord } from "./webSpeech";

describe("isWakeWord", () => {
  it.each(["alfred", "Alfred", "alfredo", "hey Alfredo, cómo va", "ALFRED"])(
    "matchea %j",
    (t) => expect(isWakeWord(t)).toBe(true),
  );

  it.each(["whatsapp", "wattson", "hola", "", "al fred"])(
    "NO matchea %j",
    (t) => expect(isWakeWord(t)).toBe(false),
  );
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd /home/newral/Lucianos/otto && pnpm --filter @wattson/hud test -- webSpeech`
Expected: FAIL — `isWakeWord` no está exportada.

- [ ] **Step 3: Implementar el matcheo y limpiar los diagnósticos**

En `apps/hud/src/voice/adapters/webSpeech.ts`, reemplazar el bloque de `WebSpeechWakeWord` completo (líneas 36–56 del working tree actual, que incluyen los `[DIAG temporal]`) por:
```ts
// Wake word: el reconocimiento es-AR entiende "Alfred" o "Alfredo"
// ("wattson" lo transcribía como "whatsapp", por eso el cambio de nombre).
export function isWakeWord(transcript: string): boolean {
  return transcript.toLowerCase().includes("alfred");
}

// Wake word: reconocimiento continuo que busca la palabra de activación.
export class WebSpeechWakeWord implements WakeWordDetector {
  private rec: any;
  start(onWake: () => void) {
    this.rec = newRecognition();
    if (!this.rec) return;
    this.rec.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (isWakeWord(e.results[i][0].transcript)) onWake();
      }
    };
    this.rec.onerror = (e: any) => console.warn("[wake] error:", e?.error, e?.message ?? "");
    this.rec.onend = () => { if (this.rec) safeStart(this.rec); }; // reinicia
    safeStart(this.rec);
  }
  stop() { const r = this.rec; this.rec = undefined; r?.stop(); }
}
```
(El resto del archivo — `speechRecognitionSupported`, `newRecognition`, `safeStart`, `WebSpeechTranscriber` — no cambia.)

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `cd /home/newral/Lucianos/otto && pnpm --filter @wattson/hud test -- webSpeech`
Expected: PASS (10 casos del `it.each`).

- [ ] **Step 5: Typecheck y commit**

Run: `cd /home/newral/Lucianos/otto && pnpm --filter @wattson/hud typecheck`
Expected: PASS.
```bash
cd /home/newral/Lucianos/otto
git add apps/hud/src/voice/adapters/webSpeech.ts apps/hud/src/voice/adapters/webSpeech.test.ts
git commit -m "feat(hud): wake word Alfred (es-AR confundía wattson con whatsapp) + isWakeWord testeable

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 3: Wiring en App, modelo flash v2.5 y activación del provider

**Files:**
- Modify: `apps/hud/src/App.tsx:5,57`
- Modify: `packages/voice/src/tts/elevenlabsTts.ts:17`
- Modify: `.env:24` (NO se commitea — está gitignoreado)

**Interfaces:**
- Consumes: `ElevenLabsSpeaker` de Task 1 (`new ElevenLabsSpeaker()` sin opciones).

- [ ] **Step 1: Cablear el speaker en `App.tsx`**

Reemplazar la línea 5:
```ts
import { SpeechSynthesisSpeaker } from "./voice/adapters/speechSynthesis";
```
por:
```ts
import { ElevenLabsSpeaker } from "./voice/adapters/elevenLabsSpeaker";
```
Y en el bloque `deps` (línea 57), reemplazar:
```ts
    tts: new SpeechSynthesisSpeaker(),
```
por:
```ts
    tts: new ElevenLabsSpeaker(),
```

- [ ] **Step 2: Cambiar el modelo a flash v2.5**

En `packages/voice/src/tts/elevenlabsTts.ts` línea 17, reemplazar:
```ts
          model_id: "eleven_monolingual_v1",
```
por:
```ts
          model_id: "eleven_flash_v2_5", // español + ~75ms + 0.5 créditos/carácter
```

- [ ] **Step 3: Activar el provider en `.env`**

En `/home/newral/Lucianos/otto/.env` línea 24, cambiar `VOICE_PROVIDER=mock` por `VOICE_PROVIDER=elevenlabs`. NO commitear el `.env` (`.env.example` queda en `mock` como default seguro).

- [ ] **Step 4: Typecheck, tests y build de todo lo tocado**

Run: `cd /home/newral/Lucianos/otto && pnpm --filter @wattson/voice typecheck && pnpm --filter @wattson/hud typecheck && pnpm --filter @wattson/hud test && pnpm --filter @wattson/hud build`
Expected: todo PASS; la suite del HUD corre completa (FSM + agentClient + elevenLabsSpeaker + webSpeech) en verde; `apps/hud/dist` se genera. Registrar el conteo de tests.

- [ ] **Step 5: Commit**

```bash
cd /home/newral/Lucianos/otto
git add apps/hud/src/App.tsx packages/voice/src/tts/elevenlabsTts.ts
git commit -m "feat(voice): voz ElevenLabs en el HUD (flash v2.5) como tts del FSM

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Verificación manual E2E (humana, no automatizada)**

1. Terminal A: `cd /home/newral/Lucianos/otto && pnpm dev:api` — al arrancar debe loguear `[voice] Using ElevenLabs TTS`.
2. Terminal B: `cd /home/newral/Lucianos/otto && pnpm --filter @wattson/hud dev` (con `VITE_API_URL`/`VITE_WS_URL` apuntando a :4000 si no son los defaults).
3. En el browser: decir **"Alfred"** → la sesión abre. Hacer una pregunta de lectura → la respuesta suena con la voz de ElevenLabs (no la robótica).
4. Interrumpir mientras habla (barge-in) → el audio se corta limpio.
5. Prueba de fallback: apagar el backend (o poner `VOICE_PROVIDER=mock`) y preguntar de nuevo → responde con la voz robótica del browser, con un warn `[tts]` en consola. Nada se cuelga.
6. Elegir la voz definitiva en el dashboard de ElevenLabs y pegar su ID en `ELEVENLABS_VOICE_ID` (reiniciar el backend para tomarla).

Este paso es checklist para el usuario; no bloquea los gates automatizados.

---

## Self-Review

- **Spec coverage:** `ElevenLabsSpeaker` + inyectables + config `VITE_API_URL` (Task 1), fallback en todos los caminos y `onEnd` exactamente una vez (Task 1), `stop()` idempotente/barge-in (Task 1), wake word alfred/alfredo + limpieza DIAG conservando `onerror` (Task 2), `model_id` flash v2.5 (Task 3), `VOICE_PROVIDER=elevenlabs` (Task 3), wiring `App.tsx` (Task 3), E2E manual con prueba de fallback (Task 3 Step 6), voz definitiva como paso manual (Task 3 Step 6.6). ✅
- **Placeholder scan:** todos los steps de código muestran el código completo; comandos con resultado esperado; sin TBD. ✅
- **Type consistency:** `ElevenLabsSpeakerOptions` (Task 1) coincide con el uso `new ElevenLabsSpeaker()` (Task 3); `isWakeWord(transcript: string): boolean` idéntica entre steps de Task 2; la interfaz `Speaker` usada por los fakes coincide con `voice/types.ts`. ✅
