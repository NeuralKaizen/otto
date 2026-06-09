# Otto — Frontend voz-reactivo "Jarvis" (HUD) — Diseño

> Spec de diseño. Estado: **prototipo / shell de experiencia**.
> Scope: la experiencia completa de voz + HUD con **datos de juguete**, validada como pieza
> autocontenida. La capa de query real (Postgres) se enchufa después por detrás de la misma
> interfaz, sin tocar la UI.
> Relacionado: `OTTO_CONTEXT.md` §3 (dato ≠ presentación), §5 (web canvas "Jarvis"),
> §7 (cerebro Claude swappable), §11 Fase 4 (display), §12 (surface resuelto).

---

## 0. Objetivo y decisiones tomadas

Construir el **web canvas "Jarvis"** de Otto como prototipo voz-reactivo: hablás sin push ni
hold, el HUD reacciona, y Otto te contesta por voz y renderiza datos en pantalla.

Decisiones cerradas en brainstorming:

| Tema | Decisión |
|---|---|
| Activación | **Wake word "Otto"** (no open-mic puro) |
| Modo de conversación | **Sesión**: "Otto" abre, hablás libre sin repetir el wake word |
| Cierre de sesión | **Frase de cierre** (principal) + **silencio largo ~30–40s** (red de seguridad) |
| Salida | **Voz (TTS) + render en el HUD** (Jarvis completo), con barge-in |
| Qué se construye ahora | **Prototipo con datos mock evidentes** (no el frontend real conectado) |
| Stack de voz | **Enfoque 2**: backend delgado + servicios pro, todo detrás de adaptadores |
| Fallback de latencia | **Híbrido** anotado: si el pipeline armado decepciona, swapear STT+TTS por una API realtime usada *solo como transporte*, manteniendo Claude como cerebro |
| Backend | **FastAPI / Python** (alineado a §7/§11; es el Otto real del futuro) |
| Frontend | **React + Vite + TypeScript** |

Por qué Enfoque 2 y no realtime (Enfoque 3): el realtime **casa el cerebro con el transporte
de voz** (rompe §7, no se puede usar Claude para los turnos), encaja peor con emitir *spec de
UI* en vez de charlar (§3), y es estructuralmente más caro (factura *tokens de audio*, ~1 orden
de magnitud sobre texto). El Enfoque 2 paga el razonamiento a precio de **texto**.

---

## 1. Arquitectura y límites de componentes

Dos procesos. Todo detrás de **adaptadores swappables**: se arranca con implementaciones
nativas del navegador (gratis, cero infra) para validar la UX end-to-end, y después se swapea
por los servicios pro sin tocar el resto.

### Frontend (navegador — React + Vite + TypeScript)

| Módulo | Interfaz | Impl. fase 1 (gratis) | Impl. fase 2 (pro) |
|---|---|---|---|
| Wake word | `WakeWordDetector` | Web Speech API (match "otto") | **Porcupine** WASM (local) |
| Captura de audio | `getUserMedia` (`echoCancellation: true`) + `AnalyserNode` (amplitud) | — | — |
| Speech→texto | `Transcriber` | Web Speech API | **Deepgram** WS |
| Máquina de estados de sesión (el corazón) | lógica pura, sin audio | — | — |
| Texto→voz | `Speaker` | `SpeechSynthesis` | **Cartesia / ElevenLabs** |
| HUD renderer | núcleo audio-reactivo + canvas de UI generativa + subtítulos | — | — |

### Backend delgado (gateway — FastAPI / Python, §7)

- **`/converse`**: recibe el texto transcripto → llama a **Claude** (adaptador de modelo, guarda
  la API key) → devuelve `{ narration, ui_spec }`.
- **Registro de queries (capa de datos):** rellena los `query` del `ui_spec`. **Hoy devuelve
  mock data de juguete; mañana corre SQL contra Postgres.** La interfaz no cambia — es la costura.
- **(Fase 2)** Acuña tokens efímeros / proxea los WS de Deepgram/Cartesia (esas keys tampoco
  pueden vivir en el navegador).

**Principio de límites:** el frontend es dueño de la experiencia (voz + HUD); el backend es el
cerebro + la fuente de datos. Cada caja se entiende y testea sola. La máquina de estados —lo más
delicado— es **lógica pura sin audio**, testeable entera sin micrófono.

---

## 2. Máquina de estados de sesión y flujo de un turno

Toda la sensación "Jarvis" sale de manejar bien estos estados. Es lógica pura; las transiciones
dependen solo de **eventos**, no del audio real.

### Estados

```
IDLE ──"Otto"──▶ LISTENING ──fin de habla──▶ PROCESSING ──respuesta──▶ SPEAKING ──┐
  ▲                  ▲                                                              │
  │                  └──────────────── (sigue la sesión) ◀───────────────────────┘
  │                  ▲
  │                  └──barge-in (hablás mientras habla)── corta TTS ─┐
  │                                                                    │
  └──frase de cierre / silencio largo (red de seguridad)──────────────┘
```

- **IDLE** — solo corre el wake-word local. Núcleo apagado/tenue. Nada se transmite.
- **LISTENING** — sesión abierta. Mic → STT en vivo, subtítulos parciales, núcleo reaccionando a
  tu amplitud de voz. Se evalúa: ¿frase de cierre? → IDLE. ¿Fin de habla? → PROCESSING.
- **PROCESSING** — texto final → `/converse` → Claude. Núcleo en "pensando".
- **SPEAKING** — llega `{narration, ui_spec}`: HUD pinta widgets con mock data **y** TTS narra;
  núcleo pulsa con la amplitud del TTS. Mic **abierto** (con cancelación de eco) → si hablás,
  **barge-in**: corta TTS → LISTENING.
- Al terminar de hablar sin interrupción → vuelve a **LISTENING** (la sesión sigue).
- **Cierre:** frase de cierre (principal) o silencio largo ~30–40s → IDLE.

### Eventos

`wakeDetected`, `transcript` (parcial/final), `closingPhrase`, `speechEnd`,
`userSpeechWhileSpeaking` (barge-in), `ttsEnd`, `timeout`.

### Flujo de un turno (punta a punta)

1. `IDLE` + Porcupine oye "Otto" (local) → `LISTENING`, núcleo se enciende.
2. Audio → STT streaming → subtítulos parciales.
3. Detecta fin de habla (o frase de cierre → cierra). Texto final → `PROCESSING`.
4. `/converse` → Claude devuelve `{narration, ui_spec}`.
5. Backend rellena los `query` del `ui_spec` con mock data → frontend.
6. `SPEAKING`: HUD pinta widgets + TTS narra, núcleo pulsa.
7. Mic abierto → si hablás, barge-in → corta TTS → `LISTENING`.
8. Si no, al terminar → `LISTENING`. Frase de cierre / silencio → `IDLE`.

**Parámetros ajustables:** umbral de silencio de seguridad (~30–40s), endpointing de fin de
habla (silencio corto), sensibilidad del barge-in (ej. ignorar muletillas muy cortas como "ajá").

---

## 3. Contrato de UI generativa y costura de datos mock

Esto hace que el prototipo **respete "dato ≠ presentación"** desde el día uno (§3) y que mañana
entre Postgres sin tocar la UI.

**Claude nunca devuelve números para mostrar. Devuelve un *spec*:**

```json
{
  "narration": "Tenés 12 tareas activas, 3 atrasadas.",
  "widgets": [
    { "type": "kpi_card", "query": "tasks_overdue",  "title": "Atrasadas" },
    { "type": "table",    "query": "tasks_by_person", "title": "Por persona" }
  ]
}
```

Tres registros desacoplados, cada uno con dueño claro:

- **Registro de widgets** (frontend): `kpi_card`, `table`, `line_chart`, … → componentes React.
  Sabe *cómo se ve* cada cosa, nada de datos.
- **Registro de queries** (backend): `tasks_overdue → {value: 3}`, `tasks_by_person → [...]`.
  **Hoy mock de juguete; mañana SQL contra Postgres.** Interfaz estable = la costura.
- **Claude** elige *qué widget + qué query + qué layout*. No ve ni inventa los números mostrados.

Flujo: Claude compone el spec → backend corre cada `query` (mock hoy) → frontend bindea datos
reales a cada widget. Idéntico al §3 del doc.

**Set de widgets:** abierto — se agregan al registro según lo que pidan las primeras demos.

### Deuda conocida (no se resuelve en el prototipo)

El campo `narration` (lo que Otto *dice*) menciona números (p. ej. "3 atrasadas") → ahí un número
pasa por el modelo. Con datos mock es inofensivo. **Para producción:** los números *mostrados*
siempre salen de query; la narración se **templatea/rellena desde los resultados**
(`"Tenés {tasks_overdue} atrasadas"`), no de la cabeza del modelo. Queda anotado, no se implementa ahora.

### Datos mock evidentes

Nombres de juguete ("Persona A/B/C"), valores redondos, y un **cartel visible "datos de
demostración"** en el HUD — para que nadie confunda el prototipo con números reales (lo peor según
el doc: un número falso que *parece* autoritativo).

---

## 4. Manejo de errores y casos borde

| Situación | Comportamiento |
|---|---|
| Sin permiso de micrófono | Estado claro "necesito permiso de micrófono" + reintentar. Único bloqueo duro. |
| Falso positivo del wake word | Abre sesión; sin habla, el silencio de seguridad la cierra. Umbral ajustable. |
| STT no devuelve nada / silencio | Timeout suave, sigue en LISTENING. |
| Error de Claude / `/converse` | Núcleo en estado error + voz corta "no pude procesar eso" → LISTENING. |
| Query mock inexistente | El widget se renderiza "sin datos", no rompe el resto del HUD. |
| Carrera de barge-in | `Speaker.stop()` idempotente; cancelar TTS nunca deja audio colgado. |
| Frase de cierre en medio de una pregunta | Match exacto prefijo/sufijo; si no matchea limpio, se trata como habla normal. |

**Principio:** ningún error tumba la sesión salvo el permiso de mic. Todo lo demás degrada con
gracia y vuelve a escuchar.

---

## 5. Testing

- **Máquina de estados (corazón):** tests unitarios de cada transición inyectando eventos. Cero
  audio. Grueso del rigor — lógica pura, ideal para TDD.
- **Adaptadores:** `FakeTranscriber` / `FakeSpeaker` / `FakeWakeWord` manejan la FSM en tests.
  Los reales (Web Speech, Deepgram, Cartesia, Porcupine) cumplen la misma interfaz → validación a mano.
- **Contrato de UI generativa:** dado un `ui_spec`, el renderer pinta los widgets correctos
  bindeando mock data → tests de render/snapshot.
- **Backend `/converse`:** test del shape `{narration, ui_spec}` y del registro de queries mock
  (Claude mockeado).
- **Verificación manual (humano en el loop):** el loop de voz real —wake word, latencia, barge-in,
  cancelación de eco— se prueba a oído. No se automatiza el "se siente Jarvis".

---

## 6. Orden de desarrollo (incremental)

1. **Esqueleto + FSM.** Frontend Vite/React + backend FastAPI. Máquina de estados con adaptadores
   *fake* y tests. Sin audio real todavía.
2. **Loop nativo-navegador.** Web Speech API (wake + STT) + `SpeechSynthesis` (TTS). HUD básico con
   núcleo audio-reactivo. Se valida la UX end-to-end con cero infra/costo.
3. **Contrato de UI generativa.** `/converse` → Claude → `{narration, ui_spec}` + registro de
   queries mock + registro de widgets. Render real de mock data en el HUD.
4. **Swap a servicios pro.** Porcupine (wake), Deepgram (STT), Cartesia/ElevenLabs (TTS) detrás de
   las mismas interfaces. Backend acuña tokens efímeros / proxea WS. Aquí llega el "wow".
5. **Pulido del HUD.** Look Jarvis (núcleo de energía, paneles) según la imagen modelo en
   `docs/`. (Candidato a usar la companion visual.)

> Fallback de latencia (anotado): si tras el paso 4 la latencia o el barge-in decepcionan,
> swapear STT+TTS por una API realtime usada *solo como transporte de voz*, manteniendo Claude
> como cerebro. Contenido porque ya está todo detrás de adaptadores.
