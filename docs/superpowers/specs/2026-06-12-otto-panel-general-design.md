# Otto — Panel general (HUD espectáculo) — Diseño

> Estado: **implementado** en `feat/voice-hud-prototype` (paso 5 del spec del HUD:
> "Pulido del HUD — look Jarvis según la imagen modelo en docs/").
> Relacionado: `2026-06-09-otto-voice-hud-design.md` (arquitectura de voz/FSM, que no cambia).

## Concepto: "observatorio de energía"

Una sola escena de partículas full-viewport con un núcleo esférico vivo como protagonista,
chrome HUD fino estilo Jarvis y paneles glass para la UI generativa. Todo el lenguaje visual
lo dicta el **estado de la FSM** — el panel *es* la cara de la máquina de estados:

| Estado | Núcleo | Acento |
|---|---|---|
| `idle` | azul hielo, escaso, respiración lenta + wordmark **OTTO** en partículas debajo | `#9fc3ff` |
| `listening` | ignición dorada (ref. `primeraactivacion.png`), radio expandido, el wordmark es absorbido por el núcleo | `#ffc66b` |
| `processing` | ciclón cian: rotación ~8x, contracción, jitter por partícula | `#6fe3ff` |
| `speaking` | ámbar cálido pulsando con cadencia de habla | `#ffb377` |

Referencias usadas de `docs/`: `reposogeneral/reposoelement` (esfera en reposo),
`primeraactivacion` (ignición dorada), frames de los videos (anillo de polvo, filamentos),
`WhatsApp Image …` + `inspo-elementos` (chrome Jarvis, paneles de datos).

## Decisiones

- **Canvas 2D propio, sin three.js ni Tailwind.** Proyección 3D manual + blending aditivo
  alcanzan exactamente el look de las referencias (~2.2k partículas) con cero dependencias
  nuevas, sin WebGL en jsdom y sin pelearse con el stack existente (CSS plano).
  Los componentes 21st.dev provistos se usaron como *espíritu* (el wordmark de partículas
  adapta el steering del particle-text-effect), no copiados: ninguno encajaba literal
  (Tailwind/Next/shadcn que el repo no tiene).
- **Una escena, no componentes sueltos**: `src/hud/scene/engine.ts` (motor puro:
  núcleo + anillo ecuatorial + starfield + wordmark) y `OttoScene.tsx` (wrapper React,
  un solo canvas, cero re-renders por frame). El motor genera una **envolvente ambiente**
  por estado (en `speaking`, cadencia tipo habla); la amplitud real de mic/TTS entra por
  la prop `amplitude` cuando exista.
- **Tipografías**: Michroma (display/wordmark), Spline Sans Mono (datos/chrome),
  Newsreader itálica (subtítulos — lo que Otto dice, en serif de cine).
- **Chrome honesto**: la telemetría muestra solo datos reales del cliente (estado, mic,
  reloj); el espectro de barras es declaradamente decorativo. El badge "datos de
  demostración" vive en la barra superior (regla dato ≠ presentación).
- **Modo vitrina** `?hud=idle|listening|processing|speaking`: fuerza el estado visual con
  contenido demo para diseño/QA sin micrófono.
- **Accesibilidad**: `prefers-reduced-motion` apaga twinkle/grano/espectro y reduce el
  movimiento del motor; el canvas es `aria-hidden` y el estado queda legible en el chrome.

## Qué NO cambió

FSM, adaptadores de voz, contrato `{narration, widgets}`, registro de widgets y sus tests.
El `Core.tsx` viejo (orbe CSS) se eliminó: la escena lo reemplaza.

## Verificación

- `npm test` (22 tests verdes), `npm run build`, eslint limpio en los archivos nuevos.
- Screenshots headless de los 4 estados vía playwright-core + Chrome contra el dev server,
  inspeccionando además el estado interno del motor (`window.__ottoEngine`, solo DEV).

## Pendientes anotados

- Cablear amplitud real (AnalyserNode del mic en `listening`, TTS en `speaking`) a
  `OttoScene.amplitude`.
- Bug preexistente (no introducido acá): en dev con StrictMode, el wake adapter loguea
  `SpeechRecognition: recognition has already started` por el doble montaje.
