# Otto — frontend (panel general / HUD voz-reactivo)

Web canvas "Jarvis" de Otto: hablás, el HUD reacciona, Otto narra y pinta widgets.
React + Vite + TypeScript, sin frameworks de UI — la escena es un canvas 2D propio.

## Correr

```bash
npm install
npm run dev     # http://localhost:5173 (necesita el backend en :8000 para /converse)
npm test        # FSM, adaptadores, registro de widgets
npm run build
```

## Modo vitrina (diseño / QA sin micrófono)

`?hud=<estado>` fuerza el estado visual con contenido demo:

- `/?hud=idle` — reposo: núcleo azul hielo + wordmark OTTO en partículas
- `/?hud=listening` — ignición dorada, sesión abierta
- `/?hud=processing` — ciclón cian, pensando
- `/?hud=speaking` — ámbar pulsante + paneles de datos demo

## Mapa rápido

| Carpeta | Qué vive ahí |
|---|---|
| `src/voice/` | FSM de sesión (lógica pura) + adaptadores swappables (wake/STT/TTS) |
| `src/hud/scene/` | Motor de partículas del panel (núcleo, anillo, polvo, wordmark) |
| `src/hud/` | Chrome del HUD, subtítulos, canvas de widgets |
| `src/hud/widgets/` | Registro de widgets de UI generativa (`kpi_card`, `table`, …) |
| `src/api/` | Cliente de `/converse` |

La escena entera reacciona al estado de la sesión (`data-state` + `WattsonScene`):
el color de acento, el espectro, el núcleo y el wordmark cambian juntos.
La amplitud real de mic/TTS entra por la prop `amplitude` de `WattsonScene`
(hoy el motor genera una envolvente ambiente propia).
